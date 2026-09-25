# Review pack 4 (IBM/sarama)

Certified cases: each test fails before the fix and passes after it.

## 5c6b581: fix: prevent idempotent producer epoch exhaustion

- Source files: async_producer.go
- Tests: TestAsyncProducerIdempotentEpochExhaustion
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestAsyncProducerIdempotentEpochExhaustion (0.03s)
         Err: (sarama.KError) kafka server: Not an error, why are you printing me?,
panic: interface conversion: sarama.protocolBody is *sarama.InitProducerIDRequest, not *sarama.ProduceRequest [recovered, repanicked]
panic({0x7ff6297aaa60?, 0x27bd056002d0?})
	C:/Program Files/Go/src/runtime/panic.go:859 +0x125
FAIL	github.com/Shopify/sarama	0.782s
```

Fix (source only, first 40 lines):
```diff
diff --git a/async_producer.go b/async_producer.go
--- a/async_producer.go
+++ b/async_producer.go
@@ -5,4 +5,5 @@ import (
 	"errors"
 	"fmt"
+	"math"
 	"sync"
 	"time"
@@ -1136,4 +1137,20 @@ func (p *asyncProducer) shutdown() {
 }
 
+func (p *asyncProducer) bumpIdempotentProducerEpoch() {
+	_, epoch := p.txnmgr.getProducerID()
+	if epoch == math.MaxInt16 {
+		Logger.Println("producer/txnmanager epoch exhausted, requesting new producer ID")
+		txnmgr, err := newTransactionManager(p.conf, p.client)
+		if err != nil {
+			Logger.Println(err)
+			return
+		}
+
+		p.txnmgr = txnmgr
+	} else {
+		p.txnmgr.bumpEpoch()
+	}
+}
+
 func (p *asyncProducer) returnError(msg *ProducerMessage, err error) {
 	// We need to reset the producer ID epoch if we set a sequence number on it, because the broker
@@ -1141,6 +1158,7 @@ func (p *asyncProducer) returnError(msg *ProducerMessage, err error) {
 	if msg.hasSequence {
 		Logger.Printf("producer/txnmanager rolling over epoch due to publish failure on %s/%d", msg.Topic, msg.Partition)
-		p.txnmgr.bumpEpoch()
+		p.bumpIdempotentProducerEpoch()
 	}
+
 	msg.clear()
 	pErr := &ProducerError{Msg: msg, Err: err}

```

## d5f076b: producer: ensure that the management message (fin) is never "leaked" (#2182)

- Source files: async_producer.go
- Tests: TestAsyncProducerBrokerRestart
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestAsyncProducerBrokerRestart (15.81s)
    async_producer_test.go:72: Unexpected successes 35 or errors 0
FAIL
FAIL	github.com/Shopify/sarama	16.277s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/async_producer.go b/async_producer.go
--- a/async_producer.go
+++ b/async_producer.go
@@ -841,4 +841,12 @@ func (bp *brokerProducer) run() {
 			}
 
+			if msg.flags&fin == fin {
+				// New broker producer that was caught up by the retry loop
+				bp.parent.retryMessage(msg, ErrShuttingDown)
+				DebugLogger.Printf("producer/broker/%d state change to [dying-%d] on %s/%d\n",
+					bp.broker.ID(), msg.retries, msg.Topic, msg.Partition)
+				continue
+			}
+
 			if bp.buffer.wouldOverflow(msg) {
 				Logger.Printf("producer/broker/%d maximum request accumulated, waiting for space\n", bp.broker.ID())

```

## f436782: fix: reduce verbosity and whitespace of multierror

- Source files: errors.go
- Tests: TestSentinelWithSingleWrappedError, TestSentinelWithWrappedError
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestSentinelWithSingleWrappedError (0.00s)
    errors_test.go:18: unexpected value 'kafka: client has run out of available brokers to talk to: mock: op error' vs 'kafka: client has run out of available brokers to talk to: 1 error occurred:
        	* mock: op error
FAIL
FAIL	github.com/Shopify/sarama	0.460s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/errors.go b/errors.go
--- a/errors.go
+++ b/errors.go
@@ -4,4 +4,5 @@ import (
 	"errors"
 	"fmt"
+	"strings"
 
 	"github.com/hashicorp/go-multierror"
@@ -64,6 +65,21 @@ var ErrReassignPartitions = errors.New("failed to reassign partitions for topic"
 var ErrDeleteRecords = errors.New("kafka server: failed to delete records")
 
-// The formatter used to format multierrors
-var MultiErrorFormat multierror.ErrorFormatFunc
+// MultiErrorFormat specifies the formatter applied to format multierrors. The
+// default implementation is a consensed version of the hashicorp/go-multierror
+// default one
+var MultiErrorFormat multierror.ErrorFormatFunc = func(es []error) string {
+	if len(es) == 1 {
+		return es[0].Error()
+	}
+
+	points := make([]string, len(es))
+	for i, err := range es {
+		points[i] = fmt.Sprintf("* %s", err)
+	}
+
+	return fmt.Sprintf(
+		"%d errors occurred:\n\t%s\n",
+		len(es), strings.Join(points, "\n\t"))
+}
 
 type sentinelError struct {

```

## 06513c1: Fix deadlock when closing Broker in brokerProducer (#2133)

- Source files: async_producer.go, broker.go
- Tests: TestAsyncProducerMultipleRetriesWithConcurrentRequests, TestBrokerProducerShutdown
- Fail runs: 3, hang: no

Evidence:
```
github.com/Shopify/sarama.(*brokerProducer).handleError(0x2c3606e3c000, 0x2c3606e18060, {0x7ff746e9aed0, 0x2c3606af6190})
FAIL	github.com/Shopify/sarama	45.455s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/async_producer.go b/async_producer.go
--- a/async_producer.go
+++ b/async_producer.go
@@ -676,4 +676,5 @@ func (p *asyncProducer) newBrokerProducer(broker *Broker) *brokerProducer {
 		input     = make(chan *ProducerMessage)
 		bridge    = make(chan *produceSet)
+		pending   = make(chan *brokerProducerResponse)
 		responses = make(chan *brokerProducerResponse)
 	)
@@ -685,5 +686,4 @@ func (p *asyncProducer) newBrokerProducer(broker *Broker) *brokerProducer {
 		output:         bridge,
 		responses:      responses,
-		stopchan:       make(chan struct{}),
 		buffer:         newProduceSet(p),
 		currentRetries: make(map[string]map[int32]error),
@@ -693,15 +693,22 @@ func (p *asyncProducer) newBrokerProducer(broker *Broker) *brokerProducer {
 	// minimal bridge to make the network response `select`able
 	go withRecover(func() {
+		// Use a wait group to know if we still have in flight requests
+		var wg sync.WaitGroup
+
 		for set := range bridge {
 			request := set.buildRequest()
 
+			// Count the in flight requests to know when we can close the pending channel safely
+			wg.Add(1)
 			// Capture the current set to forward in the callback
 			sendResponse := func(set *produceSet) ProduceCallback {
 				return func(response *ProduceResponse, err error) {
-					responses <- &brokerProducerResponse{
+					// Forward the response to make sure we do not block the responseReceiver
+					pending <- &brokerProducerResponse{
 						set: set,
 						err: err,
 						res: response,
 					}
+					wg.Done()
 				}
 			}(set)
@@ -722,5 +729,40 @@ func (p *asyncProducer) newBrokerProducer(broker *Broker) *brokerProducer {
```

## df0fb3d: fix: correct bugs in DescribeGroupsResponse

- Source files: consumer_group_members.go, describe_groups_response.go
- Tests: TestConsumerGroupMemberAssignment, TestConsumerGroupMemberMetadata, TestConsumerGroupMemberMetadataV1Decode
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerGroupMemberMetadataV1Decode (0.00s)
    consumer_group_members_test.go:73: Failed to decode V1 data kafka: error decoding packet: invalid length
FAIL
FAIL	github.com/Shopify/sarama	0.500s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer_group_members.go b/consumer_group_members.go
--- a/consumer_group_members.go
+++ b/consumer_group_members.go
@@ -2,8 +2,10 @@ package sarama
 
 // ConsumerGroupMemberMetadata holds the metadata for consumer group
+// https://github.com/apache/kafka/blob/trunk/clients/src/main/resources/common/message/ConsumerProtocolSubscription.json
 type ConsumerGroupMemberMetadata struct {
-	Version  int16
-	Topics   []string
-	UserData []byte
+	Version         int16
+	Topics          []string
+	UserData        []byte
+	OwnedPartitions []*OwnedPartition
 }
 
@@ -34,4 +36,42 @@ func (m *ConsumerGroupMemberMetadata) decode(pd packetDecoder) (err error) {
 		return
 	}
+	if m.Version >= 1 {
+		n, err := pd.getArrayLength()
+		if err != nil {
+			// permit missing data here in case of misbehaving 3rd party
+			// clients who incorrectly marked the member metadata as V1 in
+			// their JoinGroup request
+			if err == ErrInsufficientData {
+				return nil
+			}
+			return err
+		}
+		if n == 0 {
+			return nil
+		}
+		m.OwnedPartitions = make([]*OwnedPartition, n)
+		for i := 0; i < n; i++ {
+			m.OwnedPartitions[i] = &OwnedPartition{}
+			if err := m.OwnedPartitions[i].decode(pd); err != nil {
+				return err
+			}
```

## f05189d: Fix wrong offsets in mock Consumer

- Source files: mocks/consumer.go
- Tests: TestConsumerOffsetsAreManagedCorrectlyWithOffsetOldest, TestConsumerOffsetsAreManagedCorrectlyWithSpecifiedOffset
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerOffsetsAreManagedCorrectlyWithOffsetOldest (0.00s)
    consumer_test.go:266: Expected offset of first message in the partition to be 0, got 1
    consumer_test.go:271: Expected offset of second message in the partition to be 1, got 2
--- FAIL: TestConsumerOffsetsAreManagedCorrectlyWithSpecifiedOffset (0.00s)
    consumer_test.go:299: Expected offset of first message to be 123, got 1
    consumer_test.go:304: Expected offset of second message to be 124, got 2
```

Fix (source only, first 40 lines):
```diff
diff --git a/mocks/consumer.go b/mocks/consumer.go
--- a/mocks/consumer.go
+++ b/mocks/consumer.go
@@ -156,11 +156,17 @@ func (c *Consumer) ExpectConsumePartition(topic string, partition int32, offset
 
 	if c.partitionConsumers[topic][partition] == nil {
+		highWatermarkOffset := offset
+		if offset == sarama.OffsetOldest {
+			highWatermarkOffset = 0
+		}
+
 		c.partitionConsumers[topic][partition] = &PartitionConsumer{
-			t:         c.t,
-			topic:     topic,
-			partition: partition,
-			offset:    offset,
-			messages:  make(chan *sarama.ConsumerMessage, c.config.ChannelBufferSize),
-			errors:    make(chan *sarama.ConsumerError, c.config.ChannelBufferSize),
+			highWaterMarkOffset: highWatermarkOffset,
+			t:                   c.t,
+			topic:               topic,
+			partition:           partition,
+			offset:              offset,
+			messages:            make(chan *sarama.ConsumerMessage, c.config.ChannelBufferSize),
+			errors:              make(chan *sarama.ConsumerError, c.config.ChannelBufferSize),
 		}
 	}
@@ -283,5 +289,5 @@ func (pc *PartitionConsumer) YieldMessage(msg *sarama.ConsumerMessage) *Partitio
 	msg.Topic = pc.topic
 	msg.Partition = pc.partition
-	msg.Offset = atomic.AddInt64(&pc.highWaterMarkOffset, 1)
+	msg.Offset = atomic.AddInt64(&pc.highWaterMarkOffset, 1) - 1
 
 	pc.messages <- msg

```

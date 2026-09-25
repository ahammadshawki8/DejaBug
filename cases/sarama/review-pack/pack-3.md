# Review pack 3 (IBM/sarama)

Certified cases: each test fails before the fix and passes after it.

## 67d977b: fix(producer): return errors for every message in retryBatch to avoid producer hang forever (#2378)

- Source files: async_producer.go
- Tests: TestAsyncProducerIdempotentRetryCheckBatch_2378
- Fail runs: 3, hang: no

Evidence:
```
FAIL	github.com/Shopify/sarama	45.098s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/async_producer.go b/async_producer.go
--- a/async_producer.go
+++ b/async_producer.go
@@ -1162,5 +1162,5 @@ func (p *asyncProducer) retryBatch(topic string, partition int32, pSet *partitio
 	for _, msg := range pSet.msgs {
 		if msg.retries >= p.conf.Producer.Retry.Max {
-			p.returnError(msg, kerr)
+			p.returnErrors(pSet.msgs, kerr)
 			return
 		}

```

## 6750d92: fix(balance): sort and de-deplicate memberIDs

- Source files: balance_strategy.go
- Tests: TestBalanceStrategyRange
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestBalanceStrategyRange (0.00s)
    --- FAIL: TestBalanceStrategyRange/2_members,_1_topic_with_duplicate_assignments,_8_partitions_each (0.00s)
            expected: sarama.BalanceStrategyPlan{"M1":map[string][]int32{"T1":[]int32{0, 1, 2, 3}}, "M2":map[string][]int32{"T1":[]int32{4, 5, 6, 7}}}
FAIL
FAIL	github.com/Shopify/sarama	0.075s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/balance_strategy.go b/balance_strategy.go
--- a/balance_strategy.go
+++ b/balance_strategy.go
@@ -118,10 +118,19 @@ func (s *balanceStrategy) Plan(members map[string]ConsumerGroupMemberMetadata, t
 	}
 
-	// Sort members for each topic
-	for topic, memberIDs := range mbt {
-		sort.Sort(&balanceStrategySortable{
-			topic:     topic,
-			memberIDs: memberIDs,
-		})
+	// func to sort and de-duplicate a StringSlice
+	uniq := func(ss sort.StringSlice) []string {
+		if ss.Len() < 2 {
+			return ss
+		}
+		sort.Sort(ss)
+		var i, j int
+		for i = 1; i < ss.Len(); i++ {
+			if ss[i] == ss[j] {
+				continue
+			}
+			j++
+			ss.Swap(i, j)
+		}
+		return ss[:j+1]
 	}
 
@@ -129,5 +138,5 @@ func (s *balanceStrategy) Plan(members map[string]ConsumerGroupMemberMetadata, t
 	plan := make(BalanceStrategyPlan, len(members))
 	for topic, memberIDs := range mbt {
-		s.coreFn(plan, memberIDs, topic, topics[topic])
+		s.coreFn(plan, uniq(memberIDs), topic, topics[topic])
 	}
 	return plan, nil
@@ -139,29 +148,4 @@ func (s *balanceStrategy) AssignmentData(memberID string, topics map[string][]in
 }
 
-type balanceStrategySortable struct {
```

## 39cc66a: Fix: fix describe group failed

- Source files: describe_groups_response.go
- Tests: TestDescribeGroupsResponseV1plus
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestDescribeGroupsResponseV1plus (0.00s)
    request_test.go:33: Decoding empty version 3 failed: kafka: insufficient data to decode packet, more bytes expected
    describe_groups_response_test.go:270: case empty decode failed, expected:&{Version:3 ThrottleTimeMs:0 Groups:[] AuthorizedOperations:0} got &{Version:3 ThrottleTimeMs:0 Groups:[] AuthorizedOperations:-1}
    request_test.go:19: Encoding empty failed
        got  [0 0 0 0 0 0 0 0 0 0 0 0] 
        want [0 0 0 0 0 0 0 0]
```

Fix (source only, first 40 lines):
```diff
diff --git a/describe_groups_response.go b/describe_groups_response.go
--- a/describe_groups_response.go
+++ b/describe_groups_response.go
@@ -2,8 +2,7 @@ package sarama
 
 type DescribeGroupsResponse struct {
-	Version              int16
-	ThrottleTimeMs       int32
-	Groups               []*GroupDescription
-	AuthorizedOperations int32
+	Version        int16
+	ThrottleTimeMs int32
+	Groups         []*GroupDescription
 }
 
@@ -22,7 +21,4 @@ func (r *DescribeGroupsResponse) encode(pe packetEncoder) error {
 		}
 	}
-	if r.Version >= 3 {
-		pe.putInt32(r.AuthorizedOperations)
-	}
 
 	return nil
@@ -49,9 +45,4 @@ func (r *DescribeGroupsResponse) decode(pd packetDecoder, version int16) (err er
 		}
 	}
-	if r.Version >= 3 {
-		if r.AuthorizedOperations, err = pd.getInt32(); err != nil {
-			return err
-		}
-	}
 
 	return nil
@@ -81,10 +72,11 @@ type GroupDescription struct {
 	Version int16
 
-	Err          KError
-	GroupId      string
-	State        string
-	ProtocolType string
```

## 3d317e1: fix: range balance strategy not like reference

- Source files: balance_strategy.go
- Tests: TestBalanceStrategyRange
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestBalanceStrategyRange (0.00s)
    --- FAIL: TestBalanceStrategyRange/2_members,_2_topics,_4_partitions_each (0.00s)
            expected: sarama.BalanceStrategyPlan{"M1":map[string][]int32{"T1":[]int32{0, 1}, "T2":[]int32{0, 1}}, "M2":map[string][]int32{"T1":[]int32{2, 3}, "T2":[]int32{2, 3}}}
    --- FAIL: TestBalanceStrategyRange/3_members,_1_topic,_1_partition_each (0.00s)
            expected: sarama.BalanceStrategyPlan{"M1":map[string][]int32{"T1":[]int32{0}}}
    --- FAIL: TestBalanceStrategyRange/2_members,_2_topics,_3_partitions_each (0.00s)
```

Fix (source only, first 40 lines):
```diff
diff --git a/balance_strategy.go b/balance_strategy.go
--- a/balance_strategy.go
+++ b/balance_strategy.go
@@ -59,16 +59,25 @@ type BalanceStrategy interface {
 
 // BalanceStrategyRange is the default and assigns partitions as ranges to consumer group members.
-// Example with one topic T with six partitions (0..5) and two members (M1, M2):
-//   M1: {T: [0, 1, 2]}
-//   M2: {T: [3, 4, 5]}
+// This follows the same logic as
+// https://kafka.apache.org/31/javadoc/org/apache/kafka/clients/consumer/RangeAssignor.html
+//
+// Example with two topics T1 and T2 with six partitions each (0..5) and two members (M1, M2):
+//   M1: {T1: [0, 1, 2], T2: [0, 1, 2]}
+//   M2: {T2: [3, 4, 5], T2: [3, 4, 5]}
 var BalanceStrategyRange = &balanceStrategy{
 	name: RangeBalanceStrategyName,
 	coreFn: func(plan BalanceStrategyPlan, memberIDs []string, topic string, partitions []int32) {
-		step := float64(len(partitions)) / float64(len(memberIDs))
+		partitionsPerConsumer := len(partitions) / len(memberIDs)
+		consumersWithExtraPartition := len(partitions) % len(memberIDs)
+
+		sort.Strings(memberIDs)
 
 		for i, memberID := range memberIDs {
-			pos := float64(i)
-			min := int(math.Floor(pos*step + 0.5))
-			max := int(math.Floor((pos+1)*step + 0.5))
+			min := i*partitionsPerConsumer + int(math.Min(float64(consumersWithExtraPartition), float64(i)))
+			extra := 0
+			if i < consumersWithExtraPartition {
+				extra = 1
+			}
+			max := min + partitionsPerConsumer + extra
 			plan.Add(memberID, topic, partitions[min:max]...)
 		}

```

## ebc05cc: fix(admin): make DeleteRecords err consistent

- Source files: admin.go
- Tests: TestClusterAdminDeleteRecordsWithLeaderNotAvailable, TestClusterAdminDeleteRecordsWithUnsupportedVersion
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestClusterAdminDeleteRecordsWithLeaderNotAvailable (0.00s)
FAIL
FAIL	github.com/Shopify/sarama	0.481s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/admin.go b/admin.go
--- a/admin.go
+++ b/admin.go
@@ -526,5 +526,5 @@ func (ca *clusterAdmin) AlterPartitionReassignments(topic string, assignment [][
 		} else {
 			if rsp.ErrorCode > 0 {
-				errs = append(errs, errors.New(rsp.ErrorCode.Error()))
+				errs = append(errs, rsp.ErrorCode)
 			}
 
@@ -532,6 +532,5 @@ func (ca *clusterAdmin) AlterPartitionReassignments(topic string, assignment [][
 				for partition, partitionError := range topicErrors {
 					if !errors.Is(partitionError.errorCode, ErrNoError) {
-						errStr := fmt.Sprintf("[%s-%d]: %s", topic, partition, partitionError.errorCode.Error())
-						errs = append(errs, errors.New(errStr))
+						errs = append(errs, fmt.Errorf("[%s-%d]: %w", topic, partition, partitionError.errorCode))
 					}
 				}
@@ -578,13 +577,14 @@ func (ca *clusterAdmin) DeleteRecords(topic string, partitionOffsets map[int32]i
 		return ErrInvalidTopic
 	}
+	errs := make([]error, 0)
 	partitionPerBroker := make(map[*Broker][]int32)
 	for partition := range partitionOffsets {
 		broker, err := ca.client.Leader(topic, partition)
 		if err != nil {
-			return err
+			errs = append(errs, err)
+			continue
 		}
 		partitionPerBroker[broker] = append(partitionPerBroker[broker], partition)
 	}
-	errs := make([]error, 0)
 	for broker, partitions := range partitionPerBroker {
 		topics := make(map[string]*DeleteRecordsRequestTopic)
@@ -593,23 +593,27 @@ func (ca *clusterAdmin) DeleteRecords(topic string, partitionOffsets map[int32]i
 			recordsToDelete[p] = partitionOffsets[p]
 		}
-		topics[topic] = &DeleteRecordsRequestTopic{PartitionOffsets: recordsToDelete}
+		topics[topic] = &DeleteRecordsRequestTopic{
```

## 3c1940a: fix: cope with OffsetsLoadInProgress on Join+Sync

- Source files: consumer_group.go
- Tests: TestConsumerGroupNewSessionDuringOffsetLoad
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerGroupNewSessionDuringOffsetLoad (0.01s)
FAIL
FAIL	github.com/Shopify/sarama	0.485s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer_group.go b/consumer_group.go
--- a/consumer_group.go
+++ b/consumer_group.go
@@ -291,19 +291,14 @@ func (c *consumerGroup) newSession(ctx context.Context, topics []string, handler
 	case ErrNoError:
 		c.memberID = join.MemberId
-	case ErrUnknownMemberId, ErrIllegalGeneration: // reset member ID and retry immediately
+	case ErrUnknownMemberId, ErrIllegalGeneration:
+		// reset member ID and retry immediately
 		c.memberID = ""
 		return c.newSession(ctx, topics, handler, retries)
-	case ErrNotCoordinatorForConsumer: // retry after backoff with coordinator refresh
+	case ErrNotCoordinatorForConsumer, ErrRebalanceInProgress, ErrOffsetsLoadInProgress:
+		// retry after backoff
 		if retries <= 0 {
 			return nil, join.Err
 		}
-
 		return c.retryNewSession(ctx, topics, handler, retries, true)
-	case ErrRebalanceInProgress: // retry after backoff
-		if retries <= 0 {
-			return nil, join.Err
-		}
-
-		return c.retryNewSession(ctx, topics, handler, retries, false)
 	default:
 		return nil, join.Err
@@ -344,19 +339,14 @@ func (c *consumerGroup) newSession(ctx context.Context, topics []string, handler
 	switch groupRequest.Err {
 	case ErrNoError:
-	case ErrUnknownMemberId, ErrIllegalGeneration: // reset member ID and retry immediately
+	case ErrUnknownMemberId, ErrIllegalGeneration:
+		// reset member ID and retry immediately
 		c.memberID = ""
 		return c.newSession(ctx, topics, handler, retries)
-	case ErrNotCoordinatorForConsumer: // retry after backoff with coordinator refresh
+	case ErrNotCoordinatorForConsumer, ErrRebalanceInProgress, ErrOffsetsLoadInProgress:
+		// retry after backoff
 		if retries <= 0 {
 			return nil, groupRequest.Err
```

## 7d8b292: fix(test): mockbroker offsetResponse vers behavior

- Source files: mockresponses.go
- Tests: TestConsumeMessageWithNewerFetchAPIVersion, TestConsumeMessageWithSessionIDs, TestConsumeMessagesFromReadReplica, TestConsumeMessagesFromReadReplicaErrorReplicaNotAvailable, TestConsumeMessagesFromReadReplicaErrorUnknown, TestConsumeMessagesFromReadReplicaLeaderFallback, TestConsumeMessagesTrackLeader, TestConsumerExtraOffsets, TestConsumerNonSequentialOffsets, TestConsumerReceivingFetchResponseWithTooOldRecords, TestConsumerTimestamps, TestExcludeUncommitted
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerExtraOffsets (0.11s)
    consumer_test.go:604: kafka: insufficient data to decode packet, more bytes expected
--- FAIL: TestConsumerReceivingFetchResponseWithTooOldRecords (0.00s)
    consumer_test.go:664: kafka: insufficient data to decode packet, more bytes expected
--- FAIL: TestConsumeMessageWithNewerFetchAPIVersion (0.00s)
    consumer_test.go:710: kafka: insufficient data to decode packet, more bytes expected
```

Fix (source only, first 40 lines):
```diff
diff --git a/mockresponses.go b/mockresponses.go
--- a/mockresponses.go
+++ b/mockresponses.go
@@ -205,5 +205,4 @@ type MockOffsetResponse struct {
 	offsets map[string]map[int32]map[int64]int64
 	t       TestReporter
-	version int16
 }
 
@@ -215,9 +214,4 @@ func NewMockOffsetResponse(t TestReporter) *MockOffsetResponse {
 }
 
-func (mor *MockOffsetResponse) SetVersion(version int16) *MockOffsetResponse {
-	mor.version = version
-	return mor
-}
-
 func (mor *MockOffsetResponse) SetOffset(topic string, partition int32, time, offset int64) *MockOffsetResponse {
 	partitions := mor.offsets[topic]
@@ -237,5 +231,5 @@ func (mor *MockOffsetResponse) SetOffset(topic string, partition int32, time, of
 func (mor *MockOffsetResponse) For(reqBody versionedDecoder) encoderWithHeader {
 	offsetRequest := reqBody.(*OffsetRequest)
-	offsetResponse := &OffsetResponse{Version: mor.version}
+	offsetResponse := &OffsetResponse{Version: offsetRequest.Version}
 	for topic, partitions := range offsetRequest.blocks {
 		for partition, block := range partitions {
@@ -270,5 +264,4 @@ type MockFetchResponse struct {
 	t              TestReporter
 	batchSize      int
-	version        int16
 }
 
@@ -283,9 +276,4 @@ func NewMockFetchResponse(t TestReporter, batchSize int) *MockFetchResponse {
 }
 
-func (mfr *MockFetchResponse) SetVersion(version int16) *MockFetchResponse {
-	mfr.version = version
-	return mfr
-}
-
```

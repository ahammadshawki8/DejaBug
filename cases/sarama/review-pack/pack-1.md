# Review pack 1 (IBM/sarama)

Certified cases: each test fails before the fix and passes after it.

## 4d07ef2: fix(protocol): return ErrUnsupportedVersion for absent broker API keys (#3741)

- Source files: api_versions.go, broker.go
- Tests: TestRestrictApiVersion, TestRestrictApiVersionDoesNotRaiseVersionBeyondUserSetMax, TestRestrictApiVersionDoesNothingIfBrokerVersionRangeMissing, TestRestrictApiVersionLeavesVersionUnchangedWhenWithinRange, TestRestrictApiVersionLowersVersionToBrokerMax
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestRestrictApiVersion (0.00s)
    --- FAIL: TestRestrictApiVersion/rejects_an_API_absent_from_what_the_broker_advertised (0.00s)
            	Error Trace:	api_versions_test.go:72
            	Error:      	Expected error with "kafka server: The version of API is not supported" in chain but got nil.
FAIL
FAIL	github.com/IBM/sarama	0.180s
```

Fix (source only, first 40 lines):
```diff
diff --git a/api_versions.go b/api_versions.go
--- a/api_versions.go
+++ b/api_versions.go
@@ -26,4 +26,11 @@ func restrictApiVersion(pb protocolBody, brokerVersions apiVersionMap) error {
 	}
 
+	// an empty map means ApiVersions was never negotiated; a populated one that
+	// omits this key means the broker does not have the API and would close the
+	// connection on the request
+	if len(brokerVersions) > 0 {
+		return ErrUnsupportedVersion
+	}
+
 	return nil // no version ranges available, no restriction
 }
diff --git a/broker.go b/broker.go
--- a/broker.go
+++ b/broker.go
@@ -1249,11 +1249,13 @@ func (b *Broker) sendAndReceive(req protocolBody, res protocolBody) error {
 // for pb's API (treating pb's current version as the client max). When the
 // broker has not advertised ApiVersions info, pb's version is left untouched
-// (optimistic). Returns (0, false) if the resulting version is below
-// minVersion.
+// (optimistic). Returns (0, false) if the broker advertised ApiVersions info
+// that omits pb's API, or if the resulting version is below minVersion.
 func (b *Broker) negotiateApiVersion(pb protocolBody, minVersion int16) (int16, bool) {
 	b.lock.Lock()
 	defer b.lock.Unlock()
 
-	_ = restrictApiVersion(pb, b.brokerAPIVersions)
+	if err := restrictApiVersion(pb, b.brokerAPIVersions); err != nil {
+		return 0, false
+	}
 	if pb.version() < minVersion {
 		return 0, false

```

## fc42022: fix: guard against 32-bit integer overflow in flexible decoder and record header allocation

- Source files: broker.go, real_decoder.go, record.go
- Tests: TestRealDecoder_getArrayLength, TestRealFlexibleDecoderGetInt32Array
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestRealDecoder_getArrayLength (0.00s)
    --- FAIL: TestRealDecoder_getArrayLength/negative_length_other_than_null_array (0.00s)
        real_decoder_test.go:70: getArrayLength() gotLen = -2147483648, want -1
        real_decoder_test.go:73: getArrayLength() gotErr = <nil>, want kafka: error decoding packet: invalid array length
FAIL
FAIL	github.com/IBM/sarama	0.179s
```

Fix (source only, first 40 lines):
```diff
diff --git a/broker.go b/broker.go
--- a/broker.go
+++ b/broker.go
@@ -1694,5 +1694,9 @@ func (b *Broker) sendAndReceiveSASLSCRAMv0() error {
 			return err
 		}
-		payload := make([]byte, int32(binary.BigEndian.Uint32(header)))
+		payloadLength := binary.BigEndian.Uint32(header)
+		if int64(payloadLength) > int64(MaxResponseSize) {
+			return PacketDecodingError{fmt.Sprintf("SASL response of length %d too large", payloadLength)}
+		}
+		payload := make([]byte, int(payloadLength))
 		n, err := b.readFull(payload)
 		if err != nil {
diff --git a/real_decoder.go b/real_decoder.go
--- a/real_decoder.go
+++ b/real_decoder.go
@@ -120,5 +120,7 @@ func (rd *realDecoder) getArrayLength() (int, error) {
 	tmp := int(int32(binary.BigEndian.Uint32(rd.raw[rd.off:])))
 	rd.off += 4
-	if tmp > rd.remaining() {
+	if tmp < -1 {
+		return -1, errInvalidArrayLength
+	} else if tmp > rd.remaining() {
 		rd.off = len(rd.raw)
 		return -1, ErrInsufficientData
@@ -183,4 +185,8 @@ func (rd *realDecoder) getVarintBytes() ([]byte, error) {
 		return nil, nil
 	}
+	if tmp > int64(rd.remaining()) {
+		rd.off = len(rd.raw)
+		return nil, ErrInsufficientData
+	}
 
 	return rd.getRawBytes(int(tmp))
@@ -383,5 +389,10 @@ func (rd *realFlexibleDecoder) getArrayLength() (int, error) {
 	}
 
-	return int(n) - 1, nil
+	if n-1 > uint64(rd.remaining()) {
```

## 6b4f9be: fix(consumer): maintain ordering of offset commit requests (#2947)

- Source files: offset_manager.go
- Tests: TestNewOffsetManager, TestOffsetManagerCommitSequence
- Fail runs: 3, hang: no

Evidence:
```
           NewKerberosClientFunc: (func(*sarama.GSSAPIConfig) (sarama.KerberosClient, error)) <nil>,
--- FAIL: TestOffsetManagerCommitSequence (0.63s)
FAIL
FAIL	github.com/IBM/sarama	0.728s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/offset_manager.go b/offset_manager.go
--- a/offset_manager.go
+++ b/offset_manager.go
@@ -252,16 +252,29 @@ func (om *offsetManager) Commit() {
 
 func (om *offsetManager) flushToBroker() {
+	broker, err := om.coordinator()
+	if err != nil {
+		om.handleError(err)
+		return
+	}
+
+	// Care needs to be taken to unlock this. Don't want to defer the unlock as this would
+	// cause the lock to be held while waiting for the broker to reply.
+	broker.lock.Lock()
 	req := om.constructRequest()
 	if req == nil {
+		broker.lock.Unlock()
 		return
 	}
+	resp, rp, err := sendOffsetCommit(broker, req)
+	broker.lock.Unlock()
 
-	broker, err := om.coordinator()
 	if err != nil {
 		om.handleError(err)
+		om.releaseCoordinator(broker)
+		_ = broker.Close()
 		return
 	}
 
-	resp, err := broker.CommitOffset(req)
+	err = handleResponsePromise(req, resp, rp, nil)
 	if err != nil {
 		om.handleError(err)
@@ -271,7 +284,18 @@ func (om *offsetManager) flushToBroker() {
 	}
 
+	broker.handleThrottledResponse(resp)
 	om.handleResponse(broker, req, resp)
```

## 385b3b4: fix(config): relax ClientID validation after 1.0.0 (#2706)

- Source files: config.go
- Tests: TestConsumerInvalidConfiguration, TestInvalidClientIDValidated, TestProducerWithInvalidConfiguration, TestSyncProducerInvalidConfiguration
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestInvalidClientIDValidated (0.00s)
        	Error Trace:	config_test.go:50
        	Error:      	Error "kafka: invalid configuration (ClientID is invalid)" does not contain "ClientID value \"\" is not valid for Kafka versions before 1.0.0"
FAIL
FAIL	github.com/IBM/sarama	0.103s
--- FAIL: TestProducerWithInvalidConfiguration (0.00s)
```

Fix (source only, first 40 lines):
```diff
diff --git a/config.go b/config.go
--- a/config.go
+++ b/config.go
@@ -16,5 +16,7 @@ import (
 const defaultClientID = "sarama"
 
-var validID = regexp.MustCompile(`\A[A-Za-z0-9._-]+\z`)
+// validClientID specifies the permitted characters for a client.id when
+// connecting to Kafka versions before 1.0.0 (KIP-190)
+var validClientID = regexp.MustCompile(`\A[A-Za-z0-9._-]+\z`)
 
 // Config is used to pass multiple configuration options to Sarama's constructors.
@@ -847,6 +849,9 @@ func (c *Config) Validate() error {
 	case c.ChannelBufferSize < 0:
 		return ConfigurationError("ChannelBufferSize must be >= 0")
-	case !validID.MatchString(c.ClientID):
-		return ConfigurationError("ClientID is invalid")
+	}
+
+	// only validate clientID locally for Kafka versions before KIP-190 was implemented
+	if !c.Version.IsAtLeast(V1_0_0_0) && !validClientID.MatchString(c.ClientID) {
+		return ConfigurationError(fmt.Sprintf("ClientID value %q is not valid for Kafka versions before 1.0.0", c.ClientID))
 	}
 

```

## 2e077cf: Fix default retention time value in offset commit (#2700)

- Source files: offset_manager.go
- Tests: TestConstructRequestRetentionTime
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConstructRequestRetentionTime (0.00s)
    --- FAIL: TestConstructRequestRetentionTime/version_0.9.0.0_retention:_0s (0.00s)
        offset_manager_test.go:630: expected retention time -1, got: 0
    --- FAIL: TestConstructRequestRetentionTime/version_0.9.0.1_retention:_0s (0.00s)
        offset_manager_test.go:630: expected retention time -1, got: 0
    --- FAIL: TestConstructRequestRetentionTime/version_0.10.0.0_retention:_0s (0.00s)
```

Fix (source only, first 40 lines):
```diff
diff --git a/offset_manager.go b/offset_manager.go
--- a/offset_manager.go
+++ b/offset_manager.go
@@ -319,7 +319,11 @@ func (om *offsetManager) constructRequest() *OffsetCommitRequest {
 	// request controlled retention was only supported from V2-V4 (it became
 	// broker-only after that) so if the user has set the config options then
-	// flow those through as retention time on the commit request
-	if r.Version >= 2 && r.Version < 5 && om.conf.Consumer.Offsets.Retention > 0 {
-		r.RetentionTime = int64(om.conf.Consumer.Offsets.Retention / time.Millisecond)
+	// flow those through as retention time on the commit request.
+	if r.Version >= 2 && r.Version < 5 {
+		// Map Sarama's default of 0 to Kafka's default of -1
+		r.RetentionTime = -1
+		if om.conf.Consumer.Offsets.Retention > 0 {
+			r.RetentionTime = int64(om.conf.Consumer.Offsets.Retention / time.Millisecond)
+		}
 	}
 

```

## 05cb9fa: fix(consumer): don't retry session if ctx canceled

- Source files: consumer_group.go
- Tests: TestConsumerShouldNotRetrySessionIfContextCancelled
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerShouldNotRetrySessionIfContextCancelled (0.00s)
panic: runtime error: invalid memory address or nil pointer dereference [recovered, repanicked]
panic({0x7ff78d28ad20?, 0x7ff78d348d60?})
	C:/Program Files/Go/src/runtime/panic.go:859 +0x125
FAIL	github.com/IBM/sarama	0.093s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer_group.go b/consumer_group.go
--- a/consumer_group.go
+++ b/consumer_group.go
@@ -243,4 +243,6 @@ func (c *consumerGroup) ResumeAll() {
 func (c *consumerGroup) retryNewSession(ctx context.Context, topics []string, handler ConsumerGroupHandler, retries int, refreshCoordinator bool) (*consumerGroupSession, error) {
 	select {
+	case <-ctx.Done():
+		return nil, ctx.Err()
 	case <-c.closed:
 		return nil, ErrClosedConsumerGroup
@@ -262,4 +264,7 @@ func (c *consumerGroup) retryNewSession(ctx context.Context, topics []string, ha
 
 func (c *consumerGroup) newSession(ctx context.Context, topics []string, handler ConsumerGroupHandler, retries int) (*consumerGroupSession, error) {
+	if ctx.Err() != nil {
+		return nil, ctx.Err()
+	}
 	coordinator, err := c.client.Coordinator(c.groupID)
 	if err != nil {

```

## 9b0419d: fix(consumer): guard against nil client

- Source files: consumer_group.go
- Tests: TestNewConsumerGroupFromClient
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestNewConsumerGroupFromClient (0.00s)
    --- FAIL: TestNewConsumerGroupFromClient/should_not_permit_nil_client (0.00s)
panic: runtime error: invalid memory address or nil pointer dereference [recovered, repanicked]
panic({0x7ff778e8ab20?, 0x7ff778f48d60?})
	C:/Program Files/Go/src/runtime/panic.go:859 +0x125
FAIL	github.com/IBM/sarama	0.096s
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer_group.go b/consumer_group.go
--- a/consumer_group.go
+++ b/consumer_group.go
@@ -115,4 +115,7 @@ func NewConsumerGroup(addrs []string, groupID string, config *Config) (ConsumerG
 // PLEASE NOTE: consumer groups can only re-use but not share clients.
 func NewConsumerGroupFromClient(groupID string, client Client) (ConsumerGroup, error) {
+	if client == nil {
+		return nil, ConfigurationError("client must not be nil")
+	}
 	// For clients passed in by the client, ensure we don't
 	// call Close() on it.

```

# Review pack 2 (IBM/sarama)

Certified cases: each test fails before the fix and passes after it.

## e9bd1b8: fix(proto): handle V3 member metadata and empty owned partitions

- Source files: consumer_group_members.go
- Tests: TestConsumerGroupMemberMetadataV3Decode
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerGroupMemberMetadataV3Decode (0.00s)
    consumer_group_members_test.go:93: Failed to decode V3 data kafka: error decoding packet: invalid length
FAIL
FAIL	github.com/IBM/sarama	0.104s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer_group_members.go b/consumer_group_members.go
--- a/consumer_group_members.go
+++ b/consumer_group_members.go
@@ -10,4 +10,6 @@ type ConsumerGroupMemberMetadata struct {
 	UserData        []byte
 	OwnedPartitions []*OwnedPartition
+	GenerationID    int32
+	RackID          *string
 }
 
@@ -23,4 +25,25 @@ func (m *ConsumerGroupMemberMetadata) encode(pe packetEncoder) error {
 	}
 
+	if m.Version >= 1 {
+		if err := pe.putArrayLength(len(m.OwnedPartitions)); err != nil {
+			return err
+		}
+		for _, op := range m.OwnedPartitions {
+			if err := op.encode(pe); err != nil {
+				return err
+			}
+		}
+	}
+
+	if m.Version >= 2 {
+		pe.putInt32(m.GenerationID)
+	}
+
+	if m.Version >= 3 {
+		if err := pe.putNullableString(m.RackID); err != nil {
+			return err
+		}
+	}
+
 	return nil
 }
@@ -49,16 +72,27 @@ func (m *ConsumerGroupMemberMetadata) decode(pd packetDecoder) (err error) {
 			return err
 		}
-		if n == 0 {
```

## 40b52c5: fix(consumer): use full range of FetchRequest vers

- Source files: consumer.go, fetch_request.go, fetch_response.go
- Tests: TestConsumeMessageWithNewerFetchAPIVersion, TestConsumerExtraOffsets, TestConsumerNonSequentialOffsets, TestConsumerReceivingFetchResponseWithTooOldRecords, TestConsumerTimestamps, TestExcludeUncommitted
- Fail runs: 3, hang: no

Evidence:
```
FAIL	github.com/IBM/sarama	45.169s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer.go b/consumer.go
--- a/consumer.go
+++ b/consumer.go
@@ -1069,18 +1069,33 @@ func (bc *brokerConsumer) fetchNewMessages() (*FetchResponse, error) {
 		MaxWaitTime: int32(bc.consumer.conf.Consumer.MaxWaitTime / time.Millisecond),
 	}
+	// Version 1 is the same as version 0.
 	if bc.consumer.conf.Version.IsAtLeast(V0_9_0_0) {
 		request.Version = 1
 	}
+	// Starting in Version 2, the requestor must be able to handle Kafka Log
+	// Message format version 1.
 	if bc.consumer.conf.Version.IsAtLeast(V0_10_0_0) {
 		request.Version = 2
 	}
+	// Version 3 adds MaxBytes.  Starting in version 3, the partition ordering in
+	// the request is now relevant.  Partitions will be processed in the order
+	// they appear in the request.
 	if bc.consumer.conf.Version.IsAtLeast(V0_10_1_0) {
 		request.Version = 3
 		request.MaxBytes = MaxResponseSize
 	}
+	// Version 4 adds IsolationLevel.  Starting in version 4, the reqestor must be
+	// able to handle Kafka log message format version 2.
+	// Version 5 adds LogStartOffset to indicate the earliest available offset of
+	// partition data that can be consumed.
 	if bc.consumer.conf.Version.IsAtLeast(V0_11_0_0) {
-		request.Version = 4
+		request.Version = 5
 		request.Isolation = bc.consumer.conf.Consumer.IsolationLevel
 	}
+	// Version 6 is the same as version 5.
+	if bc.consumer.conf.Version.IsAtLeast(V1_0_0_0) {
+		request.Version = 6
+	}
+	// Version 7 adds incremental fetch request support.
 	if bc.consumer.conf.Version.IsAtLeast(V1_1_0_0) {
 		request.Version = 7
@@ -1091,7 +1106,15 @@ func (bc *brokerConsumer) fetchNewMessages() (*FetchResponse, error) {
 		request.SessionEpoch = -1
```

## 1532d9f: fix(proto): ensure req+resp requiredVersion match (#2548)

- Source files: describe_configs_request.go, describe_configs_response.go
- Tests: TestAllocateBodyProtocolVersions
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestAllocateBodyProtocolVersions (0.00s)
    --- FAIL: TestAllocateBodyProtocolVersions/1.1.0-DescribeConfigsRequest (0.00s)
            	Error Trace:	request_test.go:244
            	Error:      	Not equal: 
            	            	expected: sarama.KafkaVersion{version:[4]uint{0x1, 0x1, 0x0, 0x0}}
            	            	--- Expected
```

Fix (source only, first 40 lines):
```diff
diff --git a/describe_configs_request.go b/describe_configs_request.go
--- a/describe_configs_request.go
+++ b/describe_configs_request.go
@@ -110,10 +110,12 @@ func (r *DescribeConfigsRequest) isValidVersion() bool {
 func (r *DescribeConfigsRequest) requiredVersion() KafkaVersion {
 	switch r.Version {
-	case 1:
-		return V1_1_0_0
 	case 2:
 		return V2_0_0_0
-	default:
+	case 1:
+		return V1_1_0_0
+	case 0:
 		return V0_11_0_0
+	default:
+		return V2_0_0_0
 	}
 }
diff --git a/describe_configs_response.go b/describe_configs_response.go
--- a/describe_configs_response.go
+++ b/describe_configs_response.go
@@ -123,10 +123,12 @@ func (r *DescribeConfigsResponse) isValidVersion() bool {
 func (r *DescribeConfigsResponse) requiredVersion() KafkaVersion {
 	switch r.Version {
-	case 1:
-		return V1_0_0_0
 	case 2:
 		return V2_0_0_0
-	default:
+	case 1:
+		return V1_1_0_0
+	case 0:
 		return V0_11_0_0
+	default:
+		return V2_0_0_0
 	}
 }

```

## 3ba807b: fix: admin retry logic

- Source files: admin.go
- Tests: Test_retryOnError
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: Test_retryOnError (0.20s)
    --- FAIL: Test_retryOnError/failing_all_attempts (0.20s)
        admin_test.go:1856: expected 4 attempts to have been made but was 3
FAIL
FAIL	github.com/IBM/sarama	0.282s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/admin.go b/admin.go
--- a/admin.go
+++ b/admin.go
@@ -208,5 +208,5 @@ func isErrNoController(err error) bool {
 // the admin client configuration
 func (ca *clusterAdmin) retryOnError(retryable func(error) bool, fn func() error) error {
-	for attemptsRemaining := ca.conf.Admin.Retry.Max; ; {
+	for attemptsRemaining := ca.conf.Admin.Retry.Max + 1; ; {
 		err := fn()
 		attemptsRemaining--

```

## 7888004: fix: admin retry logic

- Source files: admin.go
- Tests: Test_retryOnError
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: Test_retryOnError (0.30s)
    --- FAIL: Test_retryOnError/failing_all_attempts (0.30s)
FAIL
FAIL	github.com/IBM/sarama	0.386s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/admin.go b/admin.go
--- a/admin.go
+++ b/admin.go
@@ -208,17 +208,15 @@ func isErrNoController(err error) bool {
 // the admin client configuration
 func (ca *clusterAdmin) retryOnError(retryable func(error) bool, fn func() error) error {
-	var err error
-	for attempt := 0; attempt < ca.conf.Admin.Retry.Max; attempt++ {
-		err = fn()
-		if err == nil || !retryable(err) {
+	for attemptsRemaining := ca.conf.Admin.Retry.Max; ; {
+		err := fn()
+		attemptsRemaining--
+		if err == nil || attemptsRemaining == 0 || !retryable(err) {
 			return err
 		}
 		Logger.Printf(
 			"admin/request retrying after %dms... (%d attempts remaining)\n",
-			ca.conf.Admin.Retry.Backoff/time.Millisecond, ca.conf.Admin.Retry.Max-attempt)
+			ca.conf.Admin.Retry.Backoff/time.Millisecond, attemptsRemaining)
 		time.Sleep(ca.conf.Admin.Retry.Backoff)
-		continue
 	}
-	return err
 }
 

```

## 2f8dcd0: fix(mock consumer): HighWaterMarkOffset (#2447)

- Source files: mocks/consumer.go
- Tests: TestConsumerHandlesExpectationsPausingResuming, TestConsumerOffsetsAreManagedCorrectlyWithSpecifiedOffset
- Fail runs: 3, hang: no

Evidence:
```
--- FAIL: TestConsumerHandlesExpectationsPausingResuming (0.00s)
    consumer_test.go:103: High water mark offset with value different from the expected:  1
    consumer_test.go:116: High water mark offset with value different from the expected:  2
    consumer_test.go:129: High water mark offset with value different from the expected:  -998
    consumer_test.go:144: High water mark offset with value different from the expected:  3
--- FAIL: TestConsumerOffsetsAreManagedCorrectlyWithSpecifiedOffset (0.00s)
```

Fix (source only, first 40 lines):
```diff
diff --git a/mocks/consumer.go b/mocks/consumer.go
--- a/mocks/consumer.go
+++ b/mocks/consumer.go
@@ -344,5 +344,5 @@ func (pc *PartitionConsumer) Messages() <-chan *sarama.ConsumerMessage {
 
 func (pc *PartitionConsumer) HighWaterMarkOffset() int64 {
-	return atomic.LoadInt64(&pc.highWaterMarkOffset) + 1
+	return atomic.LoadInt64(&pc.highWaterMarkOffset)
 }
 

```

## 66e60c7: fix(consumer): don't retry FindCoordinator forever (#2427)

- Source files: consumer_group.go
- Tests: TestConsumerGroupSessionDoesNotRetryForever
- Fail runs: 3, hang: no

Evidence:
```
FAIL	github.com/Shopify/sarama	45.100s
FAIL
```

Fix (source only, first 40 lines):
```diff
diff --git a/consumer_group.go b/consumer_group.go
--- a/consumer_group.go
+++ b/consumer_group.go
@@ -253,5 +253,8 @@ func (c *consumerGroup) retryNewSession(ctx context.Context, topics []string, ha
 		err := c.client.RefreshCoordinator(c.groupID)
 		if err != nil {
-			return c.retryNewSession(ctx, topics, handler, retries, true)
+			if retries <= 0 {
+				return nil, err
+			}
+			return c.retryNewSession(ctx, topics, handler, retries-1, true)
 		}
 	}

```

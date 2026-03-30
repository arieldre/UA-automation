// Global env vars for all tests — set before any module is required
process.env.GOOGLE_DEVELOPER_TOKEN  = 'test-dev-token';
process.env.GOOGLE_CUSTOMER_ID      = '111111111';
process.env.GOOGLE_CLIENT_ID        = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET    = 'test-client-secret';
process.env.GOOGLE_REFRESH_TOKEN    = 'test-refresh-token';
process.env.UA_GOAT_MONGODB_URI     = 'mongodb://localhost:27017';
process.env.APPSFLYER_TOKEN         = 'test-af-token';
process.env.APPSFLYER_ANDROID_APP_ID = 'com.test.app';
process.env.APPSFLYER_IOS_APP_ID    = 'id123456789';

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const { Server } = require('socket.io');
const FaultToleranceManager = require('./services/faultTolerance');
require('dotenv').config();

const app = express();
const server = createServer(app);

// Initialize fault tolerance manager
const faultTolerance = new FaultToleranceManager();

// Socket.IO setup with Redis adapter for clustering (if available)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
  },
  // Use Redis adapter if Redis URL is provided for clustering
  adapter: process.env.REDIS_URL ? require('socket.io-redis')(process.env.REDIS_URL) : undefined
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests from file:// (for demo-monitor.html) and localhost
    const allowedOrigins = [
      process.env.CLIENT_URL || "http://localhost:5173",
      "http://localhost:5173",
      "http://localhost",
      null // This allows file:// protocol
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for demo purposes
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Request counter for monitoring
let requestCount = 0;

// Add distributed system info to requests
app.use((req, res, next) => {
  req.nodeId = process.env.NODE_ID || 'node-1';
  req.workerId = process.env.WORKER_ID || '1';
  req.faultTolerance = faultTolerance;
  
  // Increment request counter
  requestCount++;
  
  next();
});

// Health check endpoint for load balancer
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    nodeId: process.env.NODE_ID || 'node-1',
    workerId: process.env.WORKER_ID || '1',
    pid: process.pid,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
    isLeader: faultTolerance.isLeader
  });
});

// Distributed system info endpoint
app.get('/system-info', (req, res) => {
  res.json({
    nodeId: process.env.NODE_ID || 'node-1',
    workerId: process.env.WORKER_ID || '1',
    pid: process.pid,
    isLeader: faultTolerance.isLeader,
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    requestsServed: requestCount,
    lastCheckpoint: faultTolerance.lastCheckpoint,
    operationLogSize: faultTolerance.operationLog.length,
    replicationNodes: faultTolerance.replicationNodes.length
  });
});

// Database connection with retry logic
async function connectDatabase() {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-system', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      console.log(`Node ${process.env.NODE_ID || 'node-1'} connected to MongoDB`);
      
      // Attempt recovery on startup
      try {
        const recovered = await faultTolerance.recoverFromFailure();
        if (recovered) {
          console.log('System recovered from previous checkpoint');
        }
      } catch (recoveryError) {
        console.warn('Recovery failed, starting fresh:', recoveryError.message);
      }
      
      break;
    } catch (error) {
      retries++;
      console.error(`Database connection attempt ${retries} failed:`, error.message);
      
      if (retries === maxRetries) {
        console.error('Max database connection retries reached');
        process.exit(1);
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }
}

// Socket.IO setup with fault tolerance integration
require('./sockets/socketHandlers')(io);

// Integrate fault tolerance with Socket.IO
io.on('connection', (socket) => {
  // Log connection for fault tolerance
  faultTolerance.logOperation({
    type: 'user-connection',
    userId: socket.user?.userId,
    nodeId: process.env.NODE_ID,
    timestamp: new Date().toISOString()
  });
});

// Make io and fault tolerance available to routes
app.use((req, res, next) => {
  req.io = io;
  req.faultTolerance = faultTolerance;
  next();
});

// Leader election endpoint - for nodes to communicate
app.post('/api/leader/stepdown', (req, res) => {
  const { newLeaderId, message } = req.body;
  faultTolerance.handleStepDownRequest(newLeaderId);
  res.json({ 
    success: true, 
    nodeId: process.env.NODE_ID,
    message: 'Step down acknowledged'
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/grievances', require('./routes/grievances'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/student', require('./routes/student'));

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  // Log error for fault tolerance
  req.faultTolerance.logOperation({
    type: 'server-error',
    error: error.message,
    stack: error.stack,
    nodeId: process.env.NODE_ID,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({
    message: 'Internal server error',
    nodeId: process.env.NODE_ID,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log(`Node ${process.env.NODE_ID} received SIGTERM, shutting down gracefully...`);
  
  // Create final checkpoint before shutdown
  try {
    await faultTolerance.createSystemCheckpoint();
    console.log('Final checkpoint created');
  } catch (error) {
    console.error('Error creating final checkpoint:', error);
  }
  
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log(`Node ${process.env.NODE_ID} shut down gracefully`);
      process.exit(0);
    });
  });
});

process.on('SIGINT', async () => {
  console.log(`Node ${process.env.NODE_ID} received SIGINT, shutting down...`);
  
  try {
    await faultTolerance.createSystemCheckpoint();
  } catch (error) {
    console.error('Error creating checkpoint on SIGINT:', error);
  }
  
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  
  try {
    await faultTolerance.createCheckpoint('emergency', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  } catch (checkpointError) {
    console.error('Error creating emergency checkpoint:', checkpointError);
  }
  
  process.exit(1);
});

// Start server
async function startServer() {
  try {
    await connectDatabase();
    
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Distributed Node ${process.env.NODE_ID || 'node-1'} running on port ${PORT}`);
      console.log(`📊 Worker ID: ${process.env.WORKER_ID || '1'}`);
      console.log(`🔧 PID: ${process.pid}`);
      console.log(`💾 Fault Tolerance: Enabled`);
      console.log(`🔄 Load Balancing: ${process.env.REDIS_URL ? 'Redis Cluster' : 'Round-Robin'}`);
    });
    
    // Start leader election using Bully Algorithm
    console.log('\n🗳️  Initiating Leader Election...');
    await faultTolerance.startLeaderElection();
    
    // Start leader heartbeat
    faultTolerance.startLeaderHeartbeat();
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
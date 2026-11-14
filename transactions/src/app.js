
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017';

const client = new MongoClient(mongoUri);

app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Connect to MongoDB
async function connectToMongo() {
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    await client.db('bank_app').command({ ping: 1 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
}

// Get transactions grouped by month
app.get(['/api/transactions', '/api/transactions/:userId'], async (req, res) => {
  const requestedUserId = req.params.userId || req.query.userId;

  if (!requestedUserId) {
    return res.json({
      service: 'transactions',
      status: 'running',
      message: 'Provide a userId to retrieve a monthly transaction report'
    });
  }

  if (!ObjectId.isValid(requestedUserId)) {
    return res.status(400).json({
      error: 'Invalid user ID format'
    });
  }

  try {
    const db = client.db('bank_app');
    const userId = new ObjectId(requestedUserId);

    const user = await db.collection('users').findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const transactions = await db.collection('users').aggregate([
      {
        $match: { _id: userId }
      },
      {
        $unwind: '$transactions'
      },
      {
        $addFields: {
          'transactions.date': {
            $cond: {
              if: {
                $eq: [{ $type: '$transactions.date' }, 'string']
              },
              then: {
                $toDate: '$transactions.date'
              },
              else: '$transactions.date'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$transactions.date' },
            year: { $year: '$transactions.date' }
          },
          transactions: {
            $push: {
              type: '$transactions.type',
              amount: '$transactions.amount',
              date: '$transactions.date'
            }
          }
        }
      },
      {
        $sort: {
          '_id.year': -1,
          '_id.month': -1
        }
      }
    ]).toArray();

    console.log(`Returning ${transactions.length} transaction groups`);

    return res.json(transactions);
  } catch (err) {
    console.error('Error processing transactions:', err);

    return res.status(500).json({
      error: 'Server error'
    });
  }
});

// Start the application after MongoDB is connected
async function start() {
  await connectToMongo();

  app.listen(port, '0.0.0.0', () => {
    console.log(`Transactions service running on port ${port}`);
  });
}

start();

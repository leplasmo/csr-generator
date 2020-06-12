const MONGO_URI = "mongodb://localhost:27017";
const MONGO_DB_NAME = "csr-test";

const {MongoClient} = require('mongodb');

describe('insert into database:', () => {
  let connection;
  let db;

  beforeAll(async () => {
    connection = await MongoClient.connect(MONGO_URI, {
      useNewUrlParser: true,
    });
    db = await connection.db(MONGO_DB_NAME);
  });

  afterAll(async () => {
    await connection.close();
    await db.close();
  });

  it('should insert a document into collection', async () => {
    const csrs = db.collection('csrs');

    const mockCsr = {
      _id: 'abcd1234',
      cn: 'www.example.com',
      san: [
        "DNS=example.com",
        "DNS=www.example.com"
      ]
    };
    await csrs.insertOne(mockCsr);

    const insertedCsr = await csrs.findOne({_id: 'abcd1234'});
    expect(insertedCsr).toEqual(mockCsr);

    await csrs.drop();
  });
});

// describe('create new csr', () => {

//   const mockRequest = {
//     "cn": "example.com",
//     "san": [
//       "DNS=www.example.com",
//       "DNS=example.com",
//       "IP=10.10.10.10"
//     ]
//   };

//   const { app } = require('./index');
//    TODO: Refactor generateCSR function in index.js

// });
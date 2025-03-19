const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5000;

app.use(bodyParser.json());
app.use(cors());

const readJsonFile = (filename) => {
  const filePath = path.join(__dirname, 'data', filename);
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
};

app.get('/api/brands', (req, res) => {
  const brands = readJsonFile('brands.json');
  const filteredBrands = brands.filter(brand => !brand.restricted);
  res.json(filteredBrands);
});

app.get('/api/loans', (req, res) => {
  const borrowers = readJsonFile('loans.json');
  const filteredBorrowers = borrowers.filter(borrower => borrower.type === "offshore");
  res.json(filteredBorrowers);
});

app.get('/api/messages', (req, res) => {
  const messages = readJsonFile('messages.json');
  const filteredMessages = messages.filter(message => message.type === "offshore");
  res.json(filteredMessages);
});

app.get('/api/queues', (req, res) => {
  const queues = readJsonFile('queues.json');
  const filteredQueues = queues.filter(queue => !queue.restricted);
  res.json(filteredQueues);
});

app.get('/api/statistics', (req, res) => {
  const statistics = readJsonFile('statistics.json');
  const filteredStatistics = statistics.filter(stat => !stat.restricted);
  res.json(filteredStatistics);
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
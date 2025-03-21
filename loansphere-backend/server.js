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
  const filteredBrands = brands.filter(brand => brand);
  res.json(filteredBrands);
});

app.get('/api/loans', (req, res) => {
  const borrowers = readJsonFile('loans.json');
  const filteredBorrowers = borrowers.filter(borrower => borrower);
  res.json(filteredBorrowers);
});

app.get('/api/messages', (req, res) => {
  const messages = readJsonFile('messages.json');
  const filteredMessages = messages.filter(message => message);
  res.json(filteredMessages);
});

app.get('/api/queues', (req, res) => {
  const queues = readJsonFile('queues.json');
  const filteredQueues = queues.filter(queue => queue);
  res.json(filteredQueues);
});

app.get("/api/statistics", (req, res) => {
  const statistics = readJsonFile("statistics.json");
  const filteredStatistics = statistics.filter((stat) => !stat.restricted);
  res.json(filteredStatistics);
});

app.get("/api/users", (req, res) => {
  const users = readJsonFile("users.json");
  res.json(users);
});

app.get("/api/users/:id", (req, res) => {
  const users = readJsonFile("users.json");
  const user = users.find((user) => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json(user);
});

app.get("/api/users/:id/statistics", (req, res) => {
  const users = readJsonFile("users.json");
  const user = users.find((user) => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const brandName = req.query.brand;

  if (!brandName || !user.statistics[brandName]) {
    return res.json(user.statistics);
  }

  res.json(user.statistics[brandName]);
});

app.get('/api/users/:id/monthlyStatistics', (req, res) => {
  const users = readJsonFile('users.json');
  const user = users.find(user => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const brandName = req.query.brand;
  const month = req.query.month;

  if (!user.monthlyStatistics) {
    return res.status(404).json({ message: 'Monthly statistics not found' });
  }

  if (!brandName || !user.monthlyStatistics[brandName]) {
    return res.json(user.monthlyStatistics);
  }

  if (month && user.monthlyStatistics[brandName][month]) {
    return res.json(user.monthlyStatistics[brandName][month]);
  }

  res.json(user.monthlyStatistics[brandName]);
});

app.get('/api/users/:id/demographics', (req, res) => {
  const users = readJsonFile('users.json');
  const user = users.find(user => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (!user.demographics) {
    return res.status(404).json({ message: 'Demographics not found' });
  }

  res.json(user.demographics);
});

app.get('/api/users/:id/registrationSources', (req, res) => {
  const users = readJsonFile('users.json');
  const user = users.find(user => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (!user.registrationSources) {
    return res.status(404).json({ message: 'Registration sources not found' });
  }

  res.json(user.registrationSources);
});

app.get('/api/users/:id/channelStatistics', (req, res) => {
  const users = readJsonFile('users.json');
  const user = users.find(user => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (!user.channelStatistics) {
    return res.status(404).json({ message: 'Channel statistics not found' });
  }

  const channelName = req.query.channel;

  if (channelName && user.channelStatistics[channelName]) {
    return res.json(user.channelStatistics[channelName]);
  }

  res.json(user.channelStatistics);
});

app.get('/api/users/:id/customerSummary', (req, res) => {
  const users = readJsonFile('users.json');
  const user = users.find(user => user.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (!user.customerSummary) {
    return res.status(404).json({ message: 'Customer summary not found' });
  }

  const brandName = req.query.brand;

  if (brandName && user.customerSummary[brandName]) {
    return res.json(user.customerSummary[brandName]);
  }

  res.json(user.customerSummary);
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
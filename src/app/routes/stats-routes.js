const { Router } = require('express');
const { getSummary } = require('../controllers/stats-controller');

const router = Router();

router.get('/summary', getSummary);

module.exports = router;

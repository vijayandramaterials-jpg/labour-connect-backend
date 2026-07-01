const express = require("express");
const router = express.Router();
const {
  createTicket,
  getAllTickets,
} = require("../controllers/supportController");

router.post("/submit", createTicket);
router.get("/list", getAllTickets); // एडमिन पैनल के लिए

module.exports = router;

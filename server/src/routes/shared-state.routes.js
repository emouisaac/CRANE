const express = require("express");

const { getSharedState, saveSharedState } = require("../config/database");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    data: getSharedState(),
  });
});

router.put("/", (req, res) => {
  const { state } = req.body || {};

  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return res.status(400).json({
      ok: false,
      error: "A valid state object is required.",
    });
  }

  const savedState = saveSharedState(state);

  return res.json({
    ok: true,
    data: savedState,
  });
});

module.exports = router;

import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import db from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const nowIso = () => new Date().toISOString();
const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/sessions", (req, res) => {
  const id = req.body.id || crypto.randomUUID();
  const mode = req.body.mode || "play";
  const settings = req.body.settings || {};
  const startedAt = req.body.startedAt || nowIso();

  try {
    const stmt = db.prepare(
      `INSERT INTO sessions (id, mode, settings_json, started_at)
       VALUES (?, ?, ?, ?)`
    );
    stmt.run(id, mode, JSON.stringify(settings), startedAt);
    res.status(201).json({ id, mode, settings, startedAt });
  } catch (error) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

app.patch("/sessions/:id", (req, res) => {
  const id = req.params.id;
  const endedAt = req.body.endedAt || nowIso();
  const result = db
    .prepare("UPDATE sessions SET ended_at = ? WHERE id = ?")
    .run(endedAt, id);
  if (!result.changes) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ id, endedAt });
});

app.get("/sessions", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const rows = db
    .prepare(
      `SELECT id, mode, settings_json, started_at, ended_at
       FROM sessions
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(limit);
  res.json(
    rows.map((row) => ({
      id: row.id,
      mode: row.mode,
      settings: parseJson(row.settings_json),
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }))
  );
});

app.post("/sessions/:id/events", (req, res) => {
  const sessionId = req.params.id;
  const events = Array.isArray(req.body.events) ? req.body.events : [req.body];
  const sessionRow = db
    .prepare("SELECT 1 FROM sessions WHERE id = ?")
    .get(sessionId);
  if (!sessionRow) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const insert = db.prepare(
    `INSERT INTO session_events
     (id, session_id, created_at, payload_json, ev, delta, is_best, street, table_size, table_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    const insertMany = db.transaction((batch) => {
      batch.forEach((event) => {
        insert.run(
          event.id || crypto.randomUUID(),
          sessionId,
          event.createdAt || nowIso(),
          JSON.stringify(event),
          event.ev ?? null,
          event.delta ?? null,
          event.isBest ? 1 : 0,
          event.street || null,
          event.players || null,
          event.table || null
        );
      });
    });
    insertMany(events);
    res.status(201).json({ inserted: events.length });
  } catch (error) {
    res.status(400).json({ error: "Failed to record events" });
  }
});

app.get("/sessions/:id/events", (req, res) => {
  const sessionId = req.params.id;
  const limit = Number(req.query.limit) || 200;
  const rows = db
    .prepare(
      `SELECT id, created_at, payload_json
       FROM session_events
       WHERE session_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(sessionId, limit);
  res.json(
    rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      payload: parseJson(row.payload_json),
    }))
  );
});

app.post("/scenarios", (req, res) => {
  const id = req.body.id || crypto.randomUUID();
  const createdAt = req.body.createdAt || nowIso();
  const data = req.body.data || {};
  try {
    db.prepare(
      `INSERT INTO scenarios (id, created_at, data_json)
       VALUES (?, ?, ?)`
    ).run(id, createdAt, JSON.stringify(data));
    res.status(201).json({ id, createdAt });
  } catch (error) {
    res.status(500).json({ error: "Failed to save scenario" });
  }
});

app.get("/scenarios", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const rows = db
    .prepare(
      `SELECT id, created_at, data_json
       FROM scenarios
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit);
  res.json(
    rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      data: parseJson(row.data_json),
    }))
  );
});

app.get("/analytics/summary", (req, res) => {
  const sessionId = req.query.sessionId;
  const where = sessionId ? "WHERE session_id = ?" : "";
  const params = sessionId ? [sessionId] : [];
  const overall = db
    .prepare(
      `SELECT COUNT(*) as total,
        SUM(COALESCE(ev, 0)) as ev_total,
        AVG(COALESCE(delta, 0)) as avg_delta,
        AVG(COALESCE(is_best, 0)) as best_rate
       FROM session_events
       ${where}`
    )
    .get(...params);
  const byTableSize = db
    .prepare(
      `SELECT table_size as players,
        COUNT(*) as total,
        SUM(COALESCE(ev, 0)) as ev_total,
        AVG(COALESCE(delta, 0)) as avg_delta,
        AVG(COALESCE(is_best, 0)) as best_rate
       FROM session_events
       ${where}
       GROUP BY table_size
       ORDER BY table_size`
    )
    .all(...params);
  res.json({
    overall: {
      total: overall.total || 0,
      evTotal: overall.ev_total || 0,
      avgDelta: overall.avg_delta || 0,
      bestRate: overall.best_rate || 0,
    },
    byTableSize,
  });
});

const port = process.env.PORT || 5174;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

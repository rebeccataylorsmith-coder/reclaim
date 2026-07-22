import type { Database } from "bun:sqlite";

let initialized = false;

export interface MotivationalQuote {
  id: string;
  text: string;
  author: string | null;
  category: string | null;
}

export interface BreathingExercise {
  id: string;
  title: string;
  description: string;
  pattern_name: string;
  inhale_seconds: number;
  hold_seconds: number | null;
  exhale_seconds: number;
  hold_after_exhale_seconds: number | null;
  cycles: number;
  duration_seconds: number;
  difficulty: string;
}

export function initSchema(db: Database): void {
  if (initialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      email           TEXT UNIQUE NOT NULL,
      display_name    TEXT,
      password_hash   TEXT,
      oauth_provider  TEXT,
      oauth_subject   TEXT,
      avatar_url      TEXT,
      prep_buffer_min            INTEGER NOT NULL DEFAULT 5,
      follow_up_buffer_min       INTEGER NOT NULL DEFAULT 10,
      default_break_duration_min INTEGER NOT NULL DEFAULT 5,
      deep_work_threshold_min    INTEGER NOT NULL DEFAULT 120,
      max_breaks_per_day         INTEGER NOT NULL DEFAULT 6,
      working_hours_start        TEXT    NOT NULL DEFAULT '08:00',
      working_hours_end          TEXT    NOT NULL DEFAULT '18:00',
      preferred_break_types      TEXT    NOT NULL DEFAULT 'breathing,quote',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calendar_connections (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider          TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
      calendar_email    TEXT NOT NULL,
      access_token      TEXT NOT NULL,
      refresh_token     TEXT,
      token_expires_at  TEXT,
      sync_enabled      INTEGER NOT NULL DEFAULT 1,
      last_synced_at    TEXT,
      sync_cursor       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS breathing_exercises (
      id                        TEXT PRIMARY KEY,
      title                     TEXT NOT NULL,
      description               TEXT,
      pattern_name              TEXT NOT NULL,
      inhale_seconds            INTEGER NOT NULL,
      hold_seconds              INTEGER,
      exhale_seconds            INTEGER NOT NULL,
      hold_after_exhale_seconds INTEGER,
      cycles                    INTEGER NOT NULL DEFAULT 3,
      duration_seconds          INTEGER NOT NULL,
      difficulty                TEXT NOT NULL DEFAULT 'beginner'
    );

    CREATE TABLE IF NOT EXISTS motivational_quotes (
      id        TEXT PRIMARY KEY,
      text      TEXT NOT NULL,
      author    TEXT,
      category  TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id   TEXT NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
      external_id     TEXT NOT NULL,
      title           TEXT NOT NULL,
      start_time      TEXT NOT NULL,
      end_time        TEXT NOT NULL,
      is_all_day      INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'confirmed',
      recurrence_id   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, external_id)
    );

    CREATE TABLE IF NOT EXISTS break_types (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description  TEXT
    );

    CREATE TABLE IF NOT EXISTS break_suggestions (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date             TEXT NOT NULL,
      suggested_start  TEXT NOT NULL,
      suggested_end    TEXT NOT NULL,
      break_type_id    TEXT REFERENCES break_types(id),
      status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'accepted', 'skipped', 'completed')),
      gap_minutes      INTEGER NOT NULL,
      ranking_score    REAL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_break_suggestions_user_date ON break_suggestions(user_id, date);

    CREATE TABLE IF NOT EXISTS break_completions (
      id                     TEXT PRIMARY KEY,
      user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      suggestion_id          TEXT REFERENCES break_suggestions(id),
      break_type_id          TEXT NOT NULL REFERENCES break_types(id),
      breathing_exercise_id  TEXT REFERENCES breathing_exercises(id),
      quote_id               TEXT REFERENCES motivational_quotes(id),
      started_at             TEXT NOT NULL,
      completed_at           TEXT,
      duration_seconds       INTEGER,
      rating                 INTEGER CHECK (rating BETWEEN 1 AND 5),
      created_at             TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_break_completions_user_date ON break_completions(user_id, date(created_at));

    CREATE TABLE IF NOT EXISTS streaks (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      current_length    INTEGER NOT NULL DEFAULT 0,
      best_length       INTEGER NOT NULL DEFAULT 0,
      last_active_date  TEXT,
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const exerciseCount = db.query("SELECT COUNT(*) as c FROM breathing_exercises").get() as { c: number } | null;
  if (exerciseCount && exerciseCount.c === 0) {
    seedBreathingExercises(db);
  }

  const quoteCount = db.query("SELECT COUNT(*) as c FROM motivational_quotes").get() as { c: number } | null;
  if (quoteCount && quoteCount.c === 0) {
    seedMotivationalQuotes(db);
  }

  const breakTypeCount = db.query("SELECT COUNT(*) as c FROM break_types").get() as { c: number } | null;
  if (breakTypeCount && breakTypeCount.c === 0) {
    seedBreakTypes(db);
  }

  initialized = true;
}

function seedBreathingExercises(db: Database): void {
  const insert = db.prepare(`
    INSERT INTO breathing_exercises
      (id, title, description, pattern_name, inhale_seconds, hold_seconds, exhale_seconds, hold_after_exhale_seconds, cycles, duration_seconds, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const exercises: Array<Array<string | number | null>> = [
    ["be-4-7-8",    "4-7-8 Breathing",  "Inhale for 4 seconds, hold for 7, exhale for 8. A calming technique that activates the parasympathetic nervous system.", "4-7-8",     4,  7,  8,  null, 4,  76,  "beginner"],
    ["be-box",      "Box Breathing",    "Equal 4-second phases: inhale, hold, exhale, hold. Used by Navy SEALs to stay calm under pressure.",              "Box",       4,  4,  4,  4,    4,  64,  "beginner"],
    ["be-4-4-4",    "Simple 4-4-4",     "Gentle 4-second rhythm for quick resets — perfect between meetings.",                                          "4-4-4",     4,  4,  4,  null, 5,  60,  "beginner"],
    ["be-5-5",      "Energizing 5-5",   "Equal 5-second inhale and exhale with no holds. Great for an energy boost without overstimulation.",           "5-5",       5,  null, 5, null, 6,  60,  "beginner"],
    ["be-4-7-8-x6", "Deep 4-7-8",       "Extended 4-7-8 with 6 cycles for deeper relaxation. Ideal at the end of a stressful block.",                    "4-7-8",     4,  7,  8,  null, 6,  114, "intermediate"],
    ["be-coherent", "Coherent Breathing","5-second inhale, 6-second exhale — tuned to 5.5 breaths per minute for optimal heart rate variability.",       "Coherent",  5,  null, 6, null, 8,  88,  "intermediate"],
  ];

  const seedMany = db.transaction(() => {
    for (const ex of exercises) {
      insert.run(...ex);
    }
  });
  seedMany();
}

export function getAllExercises(db: Database): BreathingExercise[] {
  return db.query("SELECT * FROM breathing_exercises ORDER BY difficulty, title").all() as BreathingExercise[];
}

export function getRandomExercise(db: Database, maxDuration?: number): BreathingExercise | null {
  let rows: BreathingExercise[];
  if (maxDuration && maxDuration > 0) {
    rows = db.query(
      "SELECT * FROM breathing_exercises WHERE duration_seconds <= ? ORDER BY RANDOM() LIMIT 1"
    ).all(maxDuration) as BreathingExercise[];
  } else {
    rows = db.query(
      "SELECT * FROM breathing_exercises ORDER BY RANDOM() LIMIT 1"
    ).all() as BreathingExercise[];
  }
  return rows.length > 0 ? rows[0] : null;
}

function seedMotivationalQuotes(db: Database): void {
  const insert = db.prepare(`
    INSERT INTO motivational_quotes (id, text, author, category)
    VALUES (?, ?, ?, ?)
  `);

  const quotes: Array<[string, string, string | null, string]> = [
    // ── focus ──
    ["mq-f-01", "The successful warrior is the average man, with laser-like focus.", "Bruce Lee", "focus"],
    ["mq-f-02", "Concentrate all your thoughts upon the work in hand. The sun's rays do not burn until brought to a focus.", "Alexander Graham Bell", "focus"],
    ["mq-f-03", "You can't depend on your eyes when your imagination is out of focus.", "Mark Twain", "focus"],
    ["mq-f-04", "My success, part of it certainly, is that I have focused in on a few things.", "Bill Gates", "focus"],
    ["mq-f-05", "Where focus goes, energy flows.", "Tony Robbins", "focus"],
    ["mq-f-06", "It is during our darkest moments that we must focus to see the light.", "Aristotle", "focus"],
    ["mq-f-07", "Focus is a matter of deciding what things you're not going to do.", "John Carmack", "focus"],

    // ── resilience ──
    ["mq-r-01", "Our greatest glory is not in never falling, but in rising every time we fall.", "Confucius", "resilience"],
    ["mq-r-02", "Do not judge me by my success, judge me by how many times I fell down and got back up again.", "Nelson Mandela", "resilience"],
    ["mq-r-03", "The human capacity for burden is like bamboo — far more flexible than you'd ever believe at first glance.", "Jodi Picoult", "resilience"],
    ["mq-r-04", "Fall seven times, stand up eight.", "Japanese Proverb", "resilience"],
    ["mq-r-05", "You may have to fight a battle more than once to win it.", "Margaret Thatcher", "resilience"],
    ["mq-r-06", "Rock bottom became the solid foundation on which I rebuilt my life.", "J.K. Rowling", "resilience"],
    ["mq-r-07", "The world breaks everyone and afterward many are strong at the broken places.", "Ernest Hemingway", "resilience"],

    // ── creativity ──
    ["mq-c-01", "Creativity is intelligence having fun.", "Albert Einstein", "creativity"],
    ["mq-c-02", "You can't use up creativity. The more you use, the more you have.", "Maya Angelou", "creativity"],
    ["mq-c-03", "The worst enemy to creativity is self-doubt.", "Sylvia Plath", "creativity"],
    ["mq-c-04", "Imagination is the beginning of creation. You imagine what you desire, you will what you imagine, and at last you create what you will.", "George Bernard Shaw", "creativity"],
    ["mq-c-05", "Originality is nothing but judicious imitation.", "Voltaire", "creativity"],
    ["mq-c-06", "Every child is an artist. The problem is how to remain an artist once we grow up.", "Pablo Picasso", "creativity"],
    ["mq-c-07", "Don't think. Thinking is the enemy of creativity.", "Ray Bradbury", "creativity"],

    // ── wellness ──
    ["mq-w-01", "To keep the body in good health is a duty... otherwise we shall not be able to keep our mind strong and clear.", "Buddha", "wellness"],
    ["mq-w-02", "Almost everything will work again if you unplug it for a few minutes — including you.", "Anne Lamott", "wellness"],
    ["mq-w-03", "Take care of your body. It's the only place you have to live.", "Jim Rohn", "wellness"],
    ["mq-w-04", "The greatest wealth is health.", "Virgil", "wellness"],
    ["mq-w-05", "Rest when you're weary. Refresh and renew yourself, your body, your mind, your spirit. Then get back to work.", "Ralph Marston", "wellness"],
    ["mq-w-06", "A calm mind brings inner strength and self-confidence, so that's very important for good health.", "Dalai Lama", "wellness"],
    ["mq-w-07", "Your body hears everything your mind says.", "Naomi Judd", "wellness"],
  ];

  const seedMany = db.transaction(() => {
    for (const q of quotes) {
      insert.run(...q);
    }
  });
  seedMany();
}

export interface QuoteQueryParams {
  category?: string;
  limit?: number;
  offset?: number;
}

export function getAllQuotes(db: Database, params?: QuoteQueryParams): MotivationalQuote[] {
  if (params?.category) {
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return db.query(
      "SELECT * FROM motivational_quotes WHERE category = ? ORDER BY id LIMIT ? OFFSET ?"
    ).all(params.category, limit, offset) as MotivationalQuote[];
  }
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 50;
  return db.query(
    "SELECT * FROM motivational_quotes ORDER BY id LIMIT ? OFFSET ?"
  ).all(limit, offset) as MotivationalQuote[];
}

export function getRandomQuote(db: Database, category?: string): MotivationalQuote | null {
  let rows: MotivationalQuote[];
  if (category) {
    rows = db.query(
      "SELECT * FROM motivational_quotes WHERE category = ? ORDER BY RANDOM() LIMIT 1"
    ).all(category) as MotivationalQuote[];
  } else {
    rows = db.query(
      "SELECT * FROM motivational_quotes ORDER BY RANDOM() LIMIT 1"
    ).all() as MotivationalQuote[];
  }
  return rows.length > 0 ? rows[0] : null;
}

function seedBreakTypes(db: Database): void {
  const insert = db.prepare(
    "INSERT INTO break_types (id, display_name, description) VALUES (?, ?, ?)"
  );

  const types: Array<[string, string, string]> = [
    ["breathing", "Breathing Exercise", "Guided breathing to restore focus"],
    ["quote", "Motivational Quote", "Short inspirational quote"],
    ["custom", "Custom Break", "Free-form break"],
  ];

  const seedMany = db.transaction(() => {
    for (const t of types) {
      insert.run(...t);
    }
  });
  seedMany();
}

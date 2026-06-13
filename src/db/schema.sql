CREATE TABLE users (
    telegram_id  BIGINT       PRIMARY KEY,
    name          TEXT         NOT NULL,
    reputation_score INTEGER  NOT NULL DEFAULT 100,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE user_balances (
    user_id        BIGINT       NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    currency_type  TEXT         NOT NULL CHECK (currency_type IN ('points', 'crypto', 'custom_token')),
    token_address  TEXT,
    amount         NUMERIC      NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, currency_type, token_address)
);

CREATE TABLE challenges (
    id                   SERIAL       PRIMARY KEY,
    creator_telegram_id  BIGINT       NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    title                TEXT         NOT NULL,
    description          TEXT         NOT NULL DEFAULT '',
    reward_type          TEXT         NOT NULL CHECK (reward_type IN ('points', 'crypto', 'custom_token')),
    reward_amount        NUMERIC      NOT NULL CHECK (reward_amount >= 0),
    token_address        TEXT,
    duration_days        INTEGER      NOT NULL CHECK (duration_days > 0),
    verifier_count       INTEGER      NOT NULL DEFAULT 1 CHECK (verifier_count IN (1, 3)),
    status               TEXT         NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deadline             TIMESTAMPTZ  NOT NULL,
    recurrence           TEXT         NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'weekly', 'monthly'))
);

CREATE TABLE evidence (
    id                    SERIAL       PRIMARY KEY,
    challenge_id          INTEGER      NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_telegram_id      BIGINT       NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    kind                  TEXT         NOT NULL CHECK (kind IN ('photo', 'document', 'text')),
    media_url             TEXT,
    text_body             TEXT,
    timestamp             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    verdict               TEXT         NOT NULL DEFAULT 'pending' CHECK (verdict IN ('pending', 'approved', 'rejected')),
    verifier_telegram_id  BIGINT       REFERENCES users(telegram_id) ON DELETE SET NULL,
    verification_time     TIMESTAMPTZ
);

CREATE TABLE sessions (
    id               SERIAL       PRIMARY KEY,
    user_telegram_id BIGINT       NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    challenge_id     INTEGER      NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    start_date       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    end_date         TIMESTAMPTZ,
    current_streak   INTEGER      NOT NULL DEFAULT 0,
    verified_status  TEXT         NOT NULL DEFAULT 'in_progress' CHECK (verified_status IN ('in_progress', 'approved', 'failed')),
    UNIQUE (user_telegram_id, challenge_id)
);

CREATE TABLE competitions (
    id                      SERIAL       PRIMARY KEY,
    group_chat_id           BIGINT       NOT NULL,
    name                    TEXT         NOT NULL,
    start_date              TIMESTAMPTZ  NOT NULL,
    end_date                TIMESTAMPTZ  NOT NULL,
    prize_pool_currency     TEXT         NOT NULL CHECK (prize_pool_currency IN ('points', 'crypto', 'custom_token')),
    prize_pool_token_address TEXT,
    prize_pool_amount       NUMERIC      NOT NULL DEFAULT 0 CHECK (prize_pool_amount >= 0)
);

CREATE TABLE teams (
    id                   SERIAL  PRIMARY KEY,
    competition_id       INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    name                 TEXT    NOT NULL,
    captain_telegram_id  BIGINT  NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    UNIQUE (competition_id, name)
);

CREATE TABLE team_members (
    team_id          INTEGER      NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_telegram_id BIGINT       NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    joined_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_telegram_id)
);

CREATE TABLE reputation_log (
    id               SERIAL       PRIMARY KEY,
    user_telegram_id BIGINT       NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    delta            INTEGER      NOT NULL,
    reason           TEXT         NOT NULL,
    challenge_id     INTEGER      REFERENCES challenges(id) ON DELETE SET NULL,
    at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE VIEW v_leaderboard AS
SELECT
    u.telegram_id         AS user_telegram_id,
    u.name                AS display_name,
    u.reputation_score    AS reputation_score,
    COALESCE(p.amount, 0) AS points_balance,
    COALESCE(c.amount, 0) AS crypto_balance,
    COALESCE(ct.amount, 0) AS custom_token_balance,
    RANK() OVER (ORDER BY u.reputation_score DESC) AS rank
FROM users u
LEFT JOIN user_balances p  ON p.user_id = u.telegram_id  AND p.currency_type = 'points'
LEFT JOIN user_balances c  ON c.user_id = u.telegram_id  AND c.currency_type = 'crypto'
LEFT JOIN user_balances ct ON ct.user_id = u.telegram_id AND ct.currency_type = 'custom_token';

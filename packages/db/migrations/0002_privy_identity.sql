CREATE TABLE sisera_users (
  id text PRIMARY KEY,
  privy_user_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  user_id text NOT NULL REFERENCES sisera_users(id),
  organization_id text NOT NULL REFERENCES organizations(id),
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_user_org_idx UNIQUE (user_id, organization_id)
);

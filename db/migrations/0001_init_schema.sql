-- 0001_init_schema: schema ban đầu theo design/ERD.md

-- Enum
create type user_role as enum ('READER', 'LIBRARIAN', 'ADMIN');
create type user_status as enum ('PENDING', 'ACTIVE', 'DISABLED');
create type borrow_status as enum ('PENDING', 'BORROWING', 'OVERDUE', 'RETURNED', 'REJECTED');
create type return_request_status as enum ('PENDING', 'CONFIRMED');
create type book_condition as enum ('NORMAL', 'DAMAGED', 'LOST');
create type fine_type as enum ('LATE', 'DAMAGED', 'LOST');
create type fine_status as enum ('UNPAID', 'PENDING', 'PAID', 'REJECTED');

-- users
create table users (
  id            integer generated always as identity primary key,
  email         varchar(255) not null,
  password_hash text not null,
  name          varchar(50) not null,
  phone         varchar(10),
  address       varchar(255),
  role          user_role not null default 'READER',
  status        user_status not null default 'PENDING',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_email_key unique (email),
  constraint users_email_lower_chk check (email = lower(email)),
  constraint users_phone_chk check (phone is null or phone ~ '^0[0-9]{9}$')
);

-- categories
create table categories (
  id         integer generated always as identity primary key,
  name       varchar(50) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index categories_name_active_key on categories (lower(name)) where deleted_at is null;

-- books
create table books (
  id                 integer generated always as identity primary key,
  category_id        integer not null references categories (id) on delete restrict,
  title              varchar(100) not null,
  author             varchar(100) not null,
  isbn               varchar(13),
  publish_year       smallint not null,
  description        varchar(255) not null,
  total_quantity     integer not null,
  available_quantity integer not null,
  borrowed_quantity  integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint books_isbn_len_chk check (isbn is null or length(isbn) in (10, 13)),
  constraint books_publish_year_chk check (publish_year >= 1900),
  constraint books_qty_nonneg_chk check (available_quantity >= 0 and borrowed_quantity >= 0),
  constraint books_qty_sum_chk check (total_quantity = available_quantity + borrowed_quantity)
);
create unique index books_isbn_active_key on books (isbn) where isbn is not null and deleted_at is null;
create index books_category_active_idx on books (category_id) where deleted_at is null;
create index books_title_lower_idx on books (lower(title));
create index books_author_lower_idx on books (lower(author));

-- borrows
create table borrows (
  id               integer generated always as identity primary key,
  reader_id        integer not null references users (id) on delete restrict,
  book_id          integer not null references books (id) on delete restrict,
  status           borrow_status not null default 'PENDING',
  requested_days   smallint not null default 14,
  borrow_date      date,
  due_date         date,
  renew_count      smallint not null default 0,
  return_date      date,
  return_condition book_condition,
  reject_reason    varchar(255),
  processed_by     integer references users (id) on delete restrict,
  processed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint borrows_requested_days_chk check (requested_days between 1 and 30),
  constraint borrows_renew_count_chk check (renew_count between 0 and 1),
  constraint borrows_rejected_reason_chk check (status <> 'REJECTED' or reject_reason is not null),
  constraint borrows_dates_chk check (
    status not in ('BORROWING', 'OVERDUE', 'RETURNED') or (borrow_date is not null and due_date is not null)
  ),
  constraint borrows_returned_chk check (
    status <> 'RETURNED' or (return_date is not null and return_condition is not null)
  )
);
create unique index borrows_reader_book_active_key on borrows (reader_id, book_id)
  where status in ('PENDING', 'BORROWING', 'OVERDUE');
create index borrows_reader_status_idx on borrows (reader_id, status);
create index borrows_book_status_idx on borrows (book_id, status);
create index borrows_status_due_idx on borrows (status, due_date);
create index borrows_created_at_idx on borrows (created_at);
create index borrows_processed_by_idx on borrows (processed_by);

-- return_requests
create table return_requests (
  id           integer generated always as identity primary key,
  borrow_id    integer not null references borrows (id) on delete cascade,
  status       return_request_status not null default 'PENDING',
  confirmed_by integer references users (id) on delete restrict,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint return_requests_confirmed_chk check (
    status <> 'CONFIRMED' or (confirmed_by is not null and confirmed_at is not null)
  )
);
create unique index return_requests_borrow_pending_key on return_requests (borrow_id) where status = 'PENDING';
create index return_requests_borrow_idx on return_requests (borrow_id);
create index return_requests_status_created_idx on return_requests (status, created_at);
create index return_requests_confirmed_by_idx on return_requests (confirmed_by);

-- fine_levels
create table fine_levels (
  id             integer generated always as identity primary key,
  name           varchar(25) not null,
  amount         numeric(12, 0) not null,
  effective_date date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint fine_levels_amount_chk check (amount > 0)
);
create unique index fine_levels_name_active_key on fine_levels (lower(name)) where deleted_at is null;

-- fines
create table fines (
  id             integer generated always as identity primary key,
  borrow_id      integer not null references borrows (id) on delete restrict,
  fine_level_id  integer references fine_levels (id) on delete set null,
  type           fine_type not null,
  level_name     varchar(25) not null,
  amount         numeric(12, 0) not null,
  note           varchar(500),
  status         fine_status not null default 'UNPAID',
  fined_date     date not null,
  marked_paid_at timestamptz,
  paid_at        timestamptz,
  reject_reason  varchar(255),
  created_by     integer not null references users (id) on delete restrict,
  processed_by   integer references users (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fines_borrow_type_key unique (borrow_id, type),
  constraint fines_amount_chk check (amount > 0),
  constraint fines_note_chk check (type = 'LATE' or note is not null),
  constraint fines_paid_chk check (status <> 'PAID' or (paid_at is not null and processed_by is not null)),
  constraint fines_rejected_reason_chk check (status <> 'REJECTED' or reject_reason is not null)
);
create index fines_status_created_idx on fines (status, created_at);
create index fines_paid_at_idx on fines (paid_at) where status = 'PAID';
create index fines_fine_level_idx on fines (fine_level_id);
create index fines_created_by_idx on fines (created_by);
create index fines_processed_by_idx on fines (processed_by);

-- updated_at tự cập nhật
create function set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on users for each row execute function set_updated_at();
create trigger categories_set_updated_at before update on categories for each row execute function set_updated_at();
create trigger books_set_updated_at before update on books for each row execute function set_updated_at();
create trigger borrows_set_updated_at before update on borrows for each row execute function set_updated_at();
create trigger return_requests_set_updated_at before update on return_requests for each row execute function set_updated_at();
create trigger fine_levels_set_updated_at before update on fine_levels for each row execute function set_updated_at();
create trigger fines_set_updated_at before update on fines for each row execute function set_updated_at();

-- RLS bật, không policy: chặn anon / authenticated qua API công khai; Prisma dùng role postgres
alter table users enable row level security;
alter table categories enable row level security;
alter table books enable row level security;
alter table borrows enable row level security;
alter table return_requests enable row level security;
alter table fine_levels enable row level security;
alter table fines enable row level security;

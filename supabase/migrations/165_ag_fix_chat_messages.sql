-- Fix ag_chat_messages: correct FK reference and enable realtime
-- Problem: request_id referenced ag_ride_requests (old table), app uses ag_trip_requests

-- 1. Drop old FK constraint
ALTER TABLE ag_chat_messages
  DROP CONSTRAINT IF EXISTS ag_chat_messages_request_id_fkey;

-- 2. Add correct FK to ag_trip_requests
ALTER TABLE ag_chat_messages
  ADD CONSTRAINT ag_chat_messages_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES ag_trip_requests(id) ON DELETE CASCADE;

-- 3. Enable realtime so subscriptions deliver new messages
ALTER PUBLICATION supabase_realtime ADD TABLE ag_chat_messages;

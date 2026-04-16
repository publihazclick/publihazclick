-- Allow hosts to delete their own live session recordings
CREATE POLICY "xzoom_live_delete_owner"
  ON public.xzoom_live_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_live_sessions.host_id AND h.user_id = auth.uid()
    )
  );

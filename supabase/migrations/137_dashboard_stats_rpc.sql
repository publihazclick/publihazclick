-- get_dashboard_sums: calcula totales del dashboard en el servidor
-- Evita transferir millones de filas de ptc_clicks y profiles al cliente.
create or replace function get_dashboard_sums()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'pending_amount',   coalesce((select sum(amount) from withdrawal_requests where status = 'pending'), 0),
    'approved_amount',  coalesce((select sum(amount) from withdrawal_requests where status = 'approved'), 0),
    'completed_amount', coalesce((select sum(amount) from withdrawal_requests where status = 'completed'), 0),
    'total_earned',     coalesce((select sum(total_earned) from profiles), 0),
    'total_donated',    coalesce((select sum(total_donated) from profiles), 0),
    'total_paid_out',   coalesce((select sum(reward_earned) from ptc_clicks), 0),
    'today_revenue',    coalesce((
      select sum(reward_earned) from ptc_clicks
      where completed_at >= current_date
        and completed_at < current_date + interval '1 day'
    ), 0)
  );
$$;

-- get_activity_chart_data: datos de actividad de los últimos N días en una sola consulta
-- Reemplaza el loop de 21 queries separados en getActivityChartData().
create or replace function get_activity_chart_data(days_back integer default 7)
returns json
language sql
security definer
set search_path = public
as $$
  with dates as (
    select generate_series(
      current_date - ((days_back - 1) || ' days')::interval,
      current_date,
      '1 day'::interval
    )::date as d
  ),
  user_counts as (
    select created_at::date as d, count(*)::int as cnt
    from profiles
    where created_at >= current_date - ((days_back - 1) || ' days')::interval
    group by 1
  ),
  click_data as (
    select completed_at::date as d, count(*)::int as cnt,
           coalesce(sum(reward_earned), 0)::numeric as revenue
    from ptc_clicks
    where completed_at >= current_date - ((days_back - 1) || ' days')::interval
    group by 1
  )
  select coalesce(json_agg(
    json_build_object(
      'date', dates.d,
      'users', coalesce(user_counts.cnt, 0),
      'clicks', coalesce(click_data.cnt, 0),
      'revenue', coalesce(click_data.revenue, 0)
    ) order by dates.d
  ), '[]'::json)
  from dates
  left join user_counts on user_counts.d = dates.d
  left join click_data on click_data.d = dates.d;
$$;

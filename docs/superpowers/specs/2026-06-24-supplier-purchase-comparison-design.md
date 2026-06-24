# Supplier Purchase Comparison Design

## Goal

Add a supplier-level comparison module to the procurement dashboard so users can select a supplier and compare purchase amount and purchase quantity across periods.

The module answers:

- How much did this supplier contribute this month?
- How did purchase amount and quantity change versus last month?
- How did purchase amount and quantity change versus the same month last year?
- What is the recent 12-month trend for this supplier?

## Placement

Add a new dashboard module named `supplierComparison`.

- Default placement: after `kpis`, before `trend`.
- Default width: 2 columns.
- It participates in the existing dashboard module ordering and width controls.
- It uses the existing dashboard data filters so its numbers match the rest of the dashboard.

## User Controls

The module includes:

- Supplier selector.
- Current month selector derived from available purchase order months.

Defaults:

- Supplier: the supplier with the highest included purchase amount under the current dashboard filters.
- Month: the latest month available in filtered purchase order data.

If the selected supplier is no longer present after data or filter changes, fall back to the highest-amount supplier.
If the selected month is no longer present, fall back to the latest available month.

## Metrics

For the selected supplier and selected month, calculate:

- Purchase amount: sum of `orderedQty * price`.
- Purchase quantity: sum of `orderedQty`.
- Order count: unique purchase order count.
- Line count: included material row count.

Comparison periods:

- Month-over-month: selected month versus previous calendar month.
- Year-over-year: selected month versus same calendar month in the previous year.

For each comparable metric, expose:

- Current value.
- Comparison value.
- Absolute delta.
- Percentage delta.
- Direction: `up`, `down`, or `flat`.
- Availability flag.

Percentage change:

- If the comparison value is greater than 0, calculate `(current - comparison) / comparison * 100`.
- If the comparison value is 0 or missing, mark the comparison as unavailable instead of showing an infinite or misleading percentage.

## Data Filtering

The supplier comparison uses the same filtering rules as existing dashboard metrics:

- Ignore zero or invalid price when enabled.
- Ignore zero or invalid quantity when enabled.
- Ignore gift rows when enabled.
- Ignore voided orders when enabled.
- Ignore empty suppliers when enabled.
- Ignore empty categories when enabled where the row is relevant.
- Ignore unparseable/other months when enabled.

This keeps supplier comparison, KPI total amount, trend, and supplier ranking aligned.

## Visualization

Use a compact operational module rather than a large dashboard section.

Top area:

- Supplier selector and selected month selector.
- Four stat tiles: amount, quantity, order count, line count.

Middle area:

- Two comparison strips:
  - 环比 / MoM for amount and quantity.
  - 同比 / YoY for amount and quantity.
- Missing comparison data shows `无可比数据`.

Bottom area:

- 12-month trend chart for the selected supplier.
- Amount and quantity are both visible. Use a dual-line chart with clear labels and tooltip values.
- Essential current-period values remain visible without hover.

Mobile layout:

- Controls stack first.
- Stat tiles render in two columns.
- Comparison strips stack vertically.
- Trend chart remains below with readable axis labels.

## Empty States

- No purchase data: show `暂无采购数据`.
- No suppliers after filters: show `当前过滤条件下暂无供应商数据`.
- Selected supplier has no data for selected month: show zero current values and unavailable comparison where needed.

## Implementation Boundaries

Add pure calculation helpers in `src/utils/dashboardMetrics.ts` rather than embedding period math inside the React component.

Expected helpers:

- Build available supplier options from filtered dashboard rows.
- Build available month options.
- Build selected supplier monthly series.
- Build selected month summary and comparisons.

The React component should only own UI state, layout, and rendering.

## Testing

Add tests in `src/utils/dashboardMetrics.test.ts` for:

- Default supplier ranking by included purchase amount.
- Current month summary for amount, quantity, order count, and line count.
- Month-over-month amount and quantity deltas.
- Year-over-year amount and quantity deltas.
- Missing comparison periods returning unavailable comparison state.
- Dashboard data filters applying to supplier comparison calculations.

Existing broader verification remains:

- `npm run lint`
- `npx tsx src/utils/dashboardMetrics.test.ts`
- `npm run build`

Full `npm test` may still be blocked by the existing missing `ProductGroups.tsx` test fixture unless that unrelated issue is fixed separately.

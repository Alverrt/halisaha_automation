# Quick Fix Guide for Multitenancy TypeScript Errors

## The Issue
All service methods need `tenantId` parameter to be passed through the tool call chain.

## Solution Architecture

The tools in fieldAgent need to receive tenantId from the context. Here's the simplest fix:

### Option 1: Pass tenantId through tool context (RECOMMENDED)

Update `fieldAgent.ts` to inject tenantId into tool execution context:

```typescript
// In fieldAgent.ts, when executing tools:
const toolResult = await tool.execute({
  ...toolCall.function.arguments,
  __tenantId: tenantId  // Inject tenant context
});
```

Then in each service method, extract tenantId from arguments:

```typescript
// In reservationService.ts
async createReservation(input: ReservationInput & { __tenantId: number }): Promise<ReservationDetails> {
  const tenantId = input.__tenantId;
  // ... rest of code
}
```

### Option 2: Make services tenant-aware classes (CLEANER)

Create tenant-scoped service instances:

```typescript
// In fieldAgent.ts
class FieldAgent {
  private getTenantServices(tenantId: number) {
    return {
      reservationService: new ReservationService(tenantId),
      analyticsService: new AnalyticsService(tenantId)
    };
  }
}
```

## Quick Fix (Immediate - for deployment)

For now, use a default tenantId of 1 for all existing calls:

### 1. Update reservationService.ts

Add `tenantId: number = 1` as last parameter to ALL methods:

```typescript
async getReservationsByWeek(weekOffset: number = 0, tenantId: number = 1): Promise<ReservationDetails[]>
async findReservationsByCustomerName(customerName: string, tenantId: number = 1): Promise<ReservationDetails[]>
async cancelReservation(reservationId: number, tenantId: number = 1): Promise<ReservationDetails>
async cancelAllWeekReservations(weekOffset: number = 0, tenantId: number = 1)
async checkDuplicateReservation(customerPhone: string, startTime: Date, endTime: Date, excludeReservationId?: number, tenantId: number = 1)
async updateCustomerInfo(reservationId: number, newName?: string, newPhone?: string, tenantId: number = 1)
async updateReservationTime(reservationId: number, startTime?: Date, endTime?: Date, tenantId: number = 1)
```

Then update all db calls to include tenantId.

### 2. Update analyticsService.ts

Same pattern - add `tenantId: number = 1` to all methods and pass to db calls.

### 3. Update tool definitions

The tools in fieldAgent need to be updated to extract tenantId from the agent context.

## Automated Fix Script

Run this to automatically add default tenantId parameters:

```bash
# This is what needs to be done manually or with find-replace:
# In reservationService.ts - add tenantId parameter to each method
# In analyticsService.ts - add tenantId parameter to each method
# Update all db.* calls to pass tenantId
```

## Files That Need Updates

1. ✅ src/database/db.ts - DONE
2. ✅ src/fieldAgent.ts - DONE
3. ✅ src/index.ts - DONE
4. ❌ src/services/reservationService.ts - NEEDS FIX
5. ❌ src/services/analyticsService.ts - NEEDS FIX

## Specific Line-by-Line Fixes for reservationService.ts

Line 68: `await db.getReservationsByDateRange(startDate, endDate, tenantId)`
Line 93: `await db.getReservationById(reservationId, tenantId)`
Line 103: `await db.cancelReservation(reservationId, tenantId)`
Line 122: `await db.cancelReservation(reservation.id, tenantId)`
Line 164: Add tenant filtering to query
Line 175: `await db.getCustomerByPhone(oldReservation.phone_number, tenantId)`
Line 181: `await db.updateCustomer(customer.id, tenantId, newName, newPhone)`
Line 190: `await db.getReservationById(reservationId, tenantId)`
Line 215: Add tenantId to time validation query
Line 224: `await db.updateReservation(reservationId, tenantId, ...)`

## Specific Fixes for analyticsService.ts

Line 37: `await db.getTotalHoursSold(startDate, endDate, tenantId)`
Line 85: Fix parameter order - should be `db.getMostLoyalCustomers(tenantId, limit, startDate, endDate)`
Line 121: `await db.getPeakHours(startDate, endDate, tenantId)`

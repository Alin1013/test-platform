# Test Case List Maintenance Design

## Goal

Improve the shared test case list so users can resize the module sidebar and can edit or delete functional, API, and UI test cases directly from the table.

## Scope

This change covers the shared `/test-cases/:type` page and both `PlatformService` implementations. The existing backend update and delete endpoints remain unchanged.

The change does not persist the chosen sidebar width across navigation or page reloads, add bulk actions, add optimistic updates, or add backend fields for functional steps and UI editor details that are not already represented by the frontend service contract.

## Interaction Design

### Resizable Module Sidebar

- Keep the initial desktop width at 248 pixels.
- Add a narrow resize handle between the module tree and the case list.
- Constrain the width to 200-420 pixels so both panes remain usable.
- Update the width while the pointer moves and stop resizing on pointer release or cancellation.
- Give the handle separator semantics, a readable label, and keyboard resizing with the arrow keys.
- Do not persist the width. A remount or reload restores 248 pixels.
- Keep the current stacked mobile layout and hide the resize handle at the mobile breakpoint.

### Table Actions

- Add a fixed right-hand `操作` column to every test case table.
- Show icon-only edit and delete buttons with accessible labels and tooltips.
- Editing opens a prefilled drawer for the selected record.
- The editor exposes the persisted common fields: name, module, priority, and status. API records also expose endpoint, HTTP method, and expected status.
- Creating a case keeps the existing creation flow. Non-persisted creation-only fields remain outside the editing contract.
- Deleting opens a confirmation dialog that includes the case code and name.
- A confirmed update or delete reloads the current query so filters, pagination, and server state stay aligned.

## Architecture

### Service Contract

Extend `PlatformService` with:

- `updateTestCase(recordId, input)` returning the updated `TestCaseRecord`.
- `deleteTestCase(recordId)` returning `Promise<void>`.

Add a resource identifier to `TestCaseRecord` while retaining the existing display code. The API adapter maps the backend numeric primary key to the resource identifier and continues mapping `code` to the current table-facing ID field. The mock adapter uses the same public contract and mutates its private in-memory collection.

`UpdateTestCaseInput` contains only fields accepted by the existing backend update schema and represented in the current frontend domain model.

### Page and Drawer State

`TestCasesPage` owns the transient sidebar width, the record being edited, and the record awaiting deletion. It continues to own the loaded rows and query state.

`CaseDrawer` supports explicit create and edit modes. Create mode retains the current defaults and success text. Edit mode is initialized from the selected record, uses edit-specific labels, and only closes after a successful update. Closing a dirty form keeps the existing discard confirmation behavior.

The action column calls page-level edit and delete handlers. This keeps data mutation and list refreshing at the page boundary while leaving the drawer focused on form behavior.

## Data Flow

1. The page loads records through `listTestCases`.
2. The user selects the edit action and the page passes the selected record to `CaseDrawer`.
3. The drawer submits persisted fields through `updateTestCase`.
4. After success, the page reruns the current list query and closes the drawer.
5. For deletion, the page opens a confirmation dialog, calls `deleteTestCase` after confirmation, and reruns the query after success.

## Error Handling

- An update failure keeps the edit drawer open and preserves entered values.
- A delete failure leaves the row visible.
- Service errors are shown through Ant Design messages with an action-specific fallback message when the thrown value has no usable text.
- Mutation buttons show loading or disabled state while their request is in flight, preventing duplicate submissions.

## Testing Seams

Testing is performed through two public boundaries agreed during design:

1. `PlatformService`: verify API request paths and payload mapping, response mapping, and mock update/delete behavior.
2. Rendered test case page: verify the accessible resize handle, pointer and keyboard resizing, edit drawer prefill and successful refresh, delete confirmation and successful removal, and the absence of the resize handle in the mobile layout through browser verification.

Each behavior is implemented as a vertical red-green slice. Run the focused service or page test during each slice, run TypeScript type checking regularly, then run the full frontend test suite and browser checks at the end.

## Acceptance Criteria

- Desktop users can resize the module sidebar between 200 and 420 pixels.
- Reloading restores the 248-pixel default sidebar width.
- Mobile users retain the stacked layout without a resize handle.
- Every test case row has visible edit and delete actions in a fixed right column.
- Editing preloads and persists all fields supported by the current frontend/backend contract.
- Deletion requires confirmation and removes the record only after the service succeeds.
- Failures preserve the user's current UI state and show a clear error message.
- API and mock modes expose equivalent update and delete behavior.

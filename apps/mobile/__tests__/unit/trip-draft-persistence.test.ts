import { createElement } from "react";
import Storage from "../../storage";
import { emptyTripDraft } from "../../forms";
import { useTripWorkflow } from "../../hooks/useTripWorkflow";
const { act, create } = require("react-test-renderer");
jest.useRealTimers();
let state: ReturnType<typeof useTripWorkflow>;
function Harness({ user }: { user: string }) { state = useTripWorkflow({ userId: user, onError: jest.fn() }); return null; }
test("restored edits retain their original version and never leak to another account", async () => {
  Storage.setItemSync("travel_log_trip_editor_draft-alex", JSON.stringify({ tripEditingId: 1, tripDraft: { ...emptyTripDraft, title: "Alex draft", version: 2 } }));
  Storage.removeItemSync("travel_log_trip_editor_draft-sam");
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { user: "draft-alex" })); });
  try {
    expect(state.tripDraft.title).toBe("Alex draft");
    expect(state.tripDraft.version).toBe(2);
    await act(async () => screen.update(createElement(Harness, { user: "draft-sam" })));
    expect(state.tripDraft.title).toBe("");
    expect(state.tripEditingId).toBeNull();
    expect(Storage.getItemSync("travel_log_trip_editor_draft-sam")).toBeNull();
    expect(JSON.parse(Storage.getItemSync("travel_log_trip_editor_draft-alex")!).tripDraft.version).toBe(2);
    await act(async () => screen.update(createElement(Harness, { user: "draft-alex" })));
    expect(state.tripDraft.title).toBe("Alex draft");
    await act(async () => state.resetTripEditor());
    expect(Storage.getItemSync("travel_log_trip_editor_draft-alex")).toBeNull();
  } finally { await act(async () => screen.unmount()); }
});

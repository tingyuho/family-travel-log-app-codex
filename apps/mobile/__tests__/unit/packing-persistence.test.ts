import { createElement } from "react";
import Storage from "../../storage";
import { usePacking } from "../../hooks/usePacking";
const { act, create } = require("react-test-renderer");
jest.useRealTimers();
const template = { id: 1, name: "Holiday", items: ["Hat", "Water"], created_at: "", updated_at: "" };
let state: ReturnType<typeof usePacking>;
function Harness({ user }: { user: string }) { state = usePacking(user); return null; }
test("packing checks survive startup, delayed templates, and remounting", async () => {
  Storage.setItemSync("travel_log_packing_checks_packing-test", JSON.stringify({ 1: ["Hat", "Removed"] }));
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { user: "packing-test" })); });
  try {
    expect(state.checkedPackingItems).toEqual({ 1: ["Hat", "Removed"] });
    await act(async () => state.setPackingTemplates([template]));
    expect(state.checkedPackingItems).toEqual({ 1: ["Hat"] });
    await act(async () => state.togglePackingItem(1, "Water"));
    await act(async () => screen.unmount());
    await act(async () => { screen = create(createElement(Harness, { user: "packing-test" })); });
    expect(state.checkedPackingItems).toEqual({ 1: ["Hat", "Water"] });
    await act(async () => state.setPackingTemplates([]));
    expect(state.checkedPackingItems).toEqual({});
  } finally { await act(async () => screen.unmount()); }
});
test("switching accounts never copies packing checks between accounts", async () => {
  Storage.setItemSync("travel_log_packing_checks_packing-alex", JSON.stringify({ 1: ["Hat"] }));
  Storage.setItemSync("travel_log_packing_checks_packing-sam", JSON.stringify({ 2: ["Shoes"] }));
  let screen: ReturnType<typeof create>;
  await act(async () => { screen = create(createElement(Harness, { user: "packing-alex" })); });
  try {
    await act(async () => state.setPackingTemplates([template]));
    await act(async () => screen.update(createElement(Harness, { user: "packing-sam" })));
    expect(state.checkedPackingItems).toEqual({ 2: ["Shoes"] });
    expect(JSON.parse(Storage.getItemSync("travel_log_packing_checks_packing-alex")!)).toEqual({ 1: ["Hat"] });
    expect(JSON.parse(Storage.getItemSync("travel_log_packing_checks_packing-sam")!)).toEqual({ 2: ["Shoes"] });
  } finally { await act(async () => screen.unmount()); }
});

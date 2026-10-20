const mockStorage = new Map<string, string>();

jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItemSync: (key: string) => mockStorage.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

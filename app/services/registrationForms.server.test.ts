/**
 * Tests for the Registration Form service (Phase 1B).
 * Prisma is mocked — pure unit tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMock, findUniqueMock, updateMock, createMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    registrationForm: {
      upsert: upsertMock,
      findUnique: findUniqueMock,
      update: updateMock,
      create: createMock,
    },
  },
}));

// eslint-disable-next-line import/first
import {
  DEFAULT_APPEARANCE,
  DEFAULT_FORM_DEFINITION,
  DEFAULT_SETTINGS,
  ensureDefaultRegistrationForm,
  upsertRegistrationForm,
} from "./registrationForms.server";

beforeEach(() => {
  upsertMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  createMock.mockReset();
});

describe("ensureDefaultRegistrationForm", () => {
  it("delegates to prisma.upsert with the default seed", async () => {
    upsertMock.mockResolvedValueOnce({ id: "rf-1", shopId: "shop-1", version: 1 });
    await ensureDefaultRegistrationForm("shop-1");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.where).toEqual({ shopId: "shop-1" });
    expect(call.create.definition).toEqual(DEFAULT_FORM_DEFINITION);
    expect(call.create.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(call.create.settings).toEqual(DEFAULT_SETTINGS);
    expect(call.update).toEqual({});
  });

  it("is idempotent — calling twice still hits upsert without crashing", async () => {
    upsertMock.mockResolvedValue({ id: "rf-1", shopId: "shop-1", version: 1 });
    await ensureDefaultRegistrationForm("shop-1");
    await ensureDefaultRegistrationForm("shop-1");
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });
});

describe("upsertRegistrationForm", () => {
  it("creates a new row when none exists", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    createMock.mockResolvedValueOnce({ id: "rf-1", version: 1 });

    await upsertRegistrationForm("shop-1", {
      status: "active",
      definition: DEFAULT_FORM_DEFINITION,
      appearance: DEFAULT_APPEARANCE,
      settings: DEFAULT_SETTINGS,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
    const data = createMock.mock.calls[0][0].data;
    expect(data.shopId).toBe("shop-1");
    expect(data.version).toBe(1);
  });

  it("updates and increments the version when a row exists", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "rf-1",
      shopId: "shop-1",
      status: "active",
      definition: DEFAULT_FORM_DEFINITION,
      appearance: DEFAULT_APPEARANCE,
      settings: DEFAULT_SETTINGS,
      version: 3,
    });
    updateMock.mockResolvedValueOnce({ id: "rf-1", version: 4 });

    await upsertRegistrationForm("shop-1", { status: "draft" });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.status).toBe("draft");
    expect(data.version).toEqual({ increment: 1 });
  });

  it("falls back to existing slices when patch is partial", async () => {
    const existingDef = { steps: [{ id: "s", titleEn: "S", fields: [] }] };
    findUniqueMock.mockResolvedValueOnce({
      id: "rf-1",
      shopId: "shop-1",
      status: "active",
      definition: existingDef,
      appearance: DEFAULT_APPEARANCE,
      settings: DEFAULT_SETTINGS,
      version: 1,
    });
    updateMock.mockResolvedValueOnce({ id: "rf-1", version: 2 });

    await upsertRegistrationForm("shop-1", { status: "draft" });

    const data = updateMock.mock.calls[0][0].data;
    expect(data.definition).toEqual(existingDef);
    expect(data.appearance).toEqual(DEFAULT_APPEARANCE);
  });
});

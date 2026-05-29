/**
 * Tests for the Registration Form service (Phase 1 — N-forms).
 * Prisma is mocked — pure unit tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, findManyMock, updateMock, createMock, deleteMock } =
  vi.hoisted(() => ({
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
    updateMock: vi.fn(),
    createMock: vi.fn(),
    deleteMock: vi.fn(),
  }));

vi.mock("../db.server", () => ({
  default: {
    registrationForm: {
      findFirst: findFirstMock,
      findMany: findManyMock,
      update: updateMock,
      create: createMock,
      delete: deleteMock,
    },
  },
}));

// eslint-disable-next-line import/first
import {
  DEFAULT_APPEARANCE,
  DEFAULT_FORM_DEFINITION,
  DEFAULT_SETTINGS,
  createRegistrationFormFromTemplate,
  deleteRegistrationForm,
  ensureDefaultRegistrationForm,
  getRegistrationForm,
  listRegistrationForms,
  resolveStorefrontForm,
  setStatus,
  updateRegistrationForm,
  upsertRegistrationForm,
} from "./registrationForms.server";

const baseRow = {
  id: "rf-1",
  shopId: "shop-1",
  name: "Registration form",
  shortCode: "abc123",
  isDefault: true,
  status: "active",
  definition: DEFAULT_FORM_DEFINITION,
  appearance: DEFAULT_APPEARANCE,
  settings: DEFAULT_SETTINGS,
  version: 1,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  findFirstMock.mockReset();
  findManyMock.mockReset();
  updateMock.mockReset();
  createMock.mockReset();
  deleteMock.mockReset();
});

describe("listRegistrationForms", () => {
  it("returns the shop's forms, default first then newest", async () => {
    findManyMock.mockResolvedValueOnce([baseRow]);
    const rows = await listRegistrationForms("shop-1");
    expect(rows).toEqual([baseRow]);
    const call = findManyMock.mock.calls[0][0];
    expect(call.where).toEqual({ shopId: "shop-1" });
    expect(call.orderBy).toEqual([
      { isDefault: "desc" },
      { createdAt: "desc" },
    ]);
  });
});

describe("createRegistrationFormFromTemplate", () => {
  it("creates a non-default draft seeded from the template definition", async () => {
    createMock.mockResolvedValueOnce({ ...baseRow, id: "rf-2", isDefault: false });
    await createRegistrationFormFromTemplate("shop-1", "samitaB2B", "My B2B form");
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.shopId).toBe("shop-1");
    expect(data.name).toBe("My B2B form");
    expect(data.isDefault).toBe(false);
    expect(data.status).toBe("draft");
    // No shortCode passed — relies on the DB cuid default.
    expect(data.shortCode).toBeUndefined();
  });

  it("falls back to the template's meta name when none is given", async () => {
    createMock.mockResolvedValueOnce({ ...baseRow, id: "rf-2" });
    await createRegistrationFormFromTemplate("shop-1", "standard");
    expect(createMock.mock.calls[0][0].data.name).toBe("Standard");
  });
});

describe("ensureDefaultRegistrationForm", () => {
  it("returns the existing default without creating", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow); // isDefault lookup hits
    const row = await ensureDefaultRegistrationForm("shop-1");
    expect(row).toEqual(baseRow);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("promotes a legacy row (no default flag) instead of creating a duplicate", async () => {
    const legacy = { ...baseRow, isDefault: false };
    findFirstMock
      .mockResolvedValueOnce(null) // no isDefault row
      .mockResolvedValueOnce(legacy); // oldest legacy row
    updateMock.mockResolvedValueOnce({ ...legacy, isDefault: true });

    const row = await ensureDefaultRegistrationForm("shop-1");
    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0].data).toEqual({ isDefault: true });
    expect(row.isDefault).toBe(true);
  });

  it("creates the back-compat default when the shop has no forms", async () => {
    findFirstMock
      .mockResolvedValueOnce(null) // no isDefault row
      .mockResolvedValueOnce(null); // no legacy row
    createMock.mockResolvedValueOnce(baseRow);

    const row = await ensureDefaultRegistrationForm("shop-1");
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.shopId).toBe("shop-1");
    expect(data.isDefault).toBe(true);
    expect(data.status).toBe("active");
    expect(data.definition).toEqual(DEFAULT_FORM_DEFINITION);
    expect(row).toEqual(baseRow);
  });
});

describe("getRegistrationForm (back-compat)", () => {
  it("returns the isDefault form", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow);
    const row = await getRegistrationForm("shop-1");
    expect(row).toEqual(baseRow);
    expect(findFirstMock.mock.calls[0][0].where).toEqual({
      shopId: "shop-1",
      isDefault: true,
    });
  });

  it("falls back to the oldest row when no default flag is set", async () => {
    const legacy = { ...baseRow, isDefault: false };
    findFirstMock
      .mockResolvedValueOnce(null) // no isDefault
      .mockResolvedValueOnce(legacy); // oldest
    const row = await getRegistrationForm("shop-1");
    expect(row).toEqual(legacy);
  });
});

describe("upsertRegistrationForm (back-compat)", () => {
  it("saves the shop's default form and increments version", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow); // ensureDefault → existing
    updateMock.mockResolvedValueOnce({ ...baseRow, version: 2 });

    await upsertRegistrationForm("shop-1", { status: "draft" });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0][0];
    expect(call.where).toEqual({ id: "rf-1" });
    expect(call.data.status).toBe("draft");
    expect(call.data.version).toEqual({ increment: 1 });
  });

  it("falls back to existing slices when the patch is partial", async () => {
    const existingDef = { steps: [{ id: "s", titleEn: "S", fields: [] }] };
    findFirstMock.mockResolvedValueOnce({ ...baseRow, definition: existingDef });
    updateMock.mockResolvedValueOnce({ ...baseRow, version: 2 });

    await upsertRegistrationForm("shop-1", { status: "draft" });

    const data = updateMock.mock.calls[0][0].data;
    expect(data.definition).toEqual(existingDef);
    expect(data.appearance).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("updateRegistrationForm", () => {
  it("updates a form by id scoped to the shop", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow); // getById
    updateMock.mockResolvedValueOnce({ ...baseRow, name: "Renamed" });

    await updateRegistrationForm("rf-1", "shop-1", { name: "Renamed" });

    expect(findFirstMock.mock.calls[0][0].where).toEqual({
      id: "rf-1",
      shopId: "shop-1",
    });
    expect(updateMock.mock.calls[0][0].data.name).toBe("Renamed");
  });

  it("throws when the id does not belong to the shop", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(
      updateRegistrationForm("rf-x", "shop-1", { status: "draft" }),
    ).rejects.toThrow(/not found/);
  });
});

describe("setStatus", () => {
  it("flips status and bumps version", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow);
    updateMock.mockResolvedValueOnce({ ...baseRow, status: "draft" });

    await setStatus("rf-1", "shop-1", "draft");

    const data = updateMock.mock.calls[0][0].data;
    expect(data.status).toBe("draft");
    expect(data.version).toEqual({ increment: 1 });
  });
});

describe("deleteRegistrationForm", () => {
  it("refuses to delete the default form", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow); // isDefault: true
    await expect(deleteRegistrationForm("rf-1", "shop-1")).rejects.toThrow(
      /default/,
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("deletes a non-default form", async () => {
    findFirstMock.mockResolvedValueOnce({ ...baseRow, isDefault: false });
    deleteMock.mockResolvedValueOnce({});
    const ok = await deleteRegistrationForm("rf-1", "shop-1");
    expect(ok).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when the form does not exist", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    expect(await deleteRegistrationForm("rf-x", "shop-1")).toBe(false);
  });
});

describe("resolveStorefrontForm", () => {
  it("resolves by shortCode when given", async () => {
    const byCode = { ...baseRow, id: "rf-2", shortCode: "xyz789", isDefault: false };
    findFirstMock.mockResolvedValueOnce(byCode);
    const row = await resolveStorefrontForm("shop-1", "xyz789");
    expect(row).toEqual(byCode);
    expect(findFirstMock.mock.calls[0][0].where).toEqual({
      shopId: "shop-1",
      shortCode: "xyz789",
    });
  });

  it("falls back to the default when no shortCode is supplied (dual-serve)", async () => {
    findFirstMock.mockResolvedValueOnce(baseRow); // ensureDefault → existing default
    const row = await resolveStorefrontForm("shop-1");
    expect(row).toEqual(baseRow);
  });

  it("back-compat: a legacy row with no shortCode match falls back to the active default", async () => {
    // shortCode lookup misses, then ensureDefault returns the default.
    findFirstMock
      .mockResolvedValueOnce(null) // shortCode miss
      .mockResolvedValueOnce(baseRow); // ensureDefault → existing default
    const row = await resolveStorefrontForm("shop-1", "stale-code");
    expect(row).toEqual(baseRow);
  });
});

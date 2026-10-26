import { describe, expect, it } from "vitest";
import { applyMapping, autoMapColumns } from "./mapping";

describe("autoMapColumns", () => {
  it("maps familiar greenhouse-style headers", () => {
    const mapping = autoMapColumns([
      "Company Name",
      "Job Title",
      "Job URL",
      "Source",
      "Contact Name",
      "Email",
      "LinkedIn",
    ]);

    expect(mapping["Company Name"]).toBe("companyName");
    expect(mapping["Job Title"]).toBe("jobTitle");
    expect(mapping["Job URL"]).toBe("jobUrl");
    expect(mapping["Email"]).toBe("contactEmail");
    expect(mapping["LinkedIn"]).toBe("contactLinkedIn");
  });

  it("leaves unfamiliar headers unmapped", () => {
    const mapping = autoMapColumns(["Weird Column XYZ", "Company"]);
    expect(mapping["Weird Column XYZ"]).toBeNull();
    expect(mapping["Company"]).toBe("companyName");
  });
});

describe("applyMapping", () => {
  it("projects raw row into canonical fields", () => {
    const result = applyMapping(
      { Company: "Acme", Title: "Eng Manager", Email: "a@b.com" },
      {
        Company: "companyName",
        Title: "jobTitle",
        Email: "contactEmail",
      },
    );
    expect(result.companyName).toBe("Acme");
    expect(result.jobTitle).toBe("Eng Manager");
    expect(result.contactEmail).toBe("a@b.com");
    expect(result.contactLinkedIn).toBeNull();
  });
});

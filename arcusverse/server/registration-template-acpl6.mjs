import { randomBytes } from "crypto";
import { uid } from "./store.mjs";

function token() {
  return randomBytes(24).toString("hex");
}

/** Friendly URL segment: letters, numbers, hyphen, underscore. */
export function normalizePublicSlug(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Suggest ACPL-6 from "ACPL Season 6", else from name/prefix. */
export function suggestPublicSlug(tournament, extras = {}) {
  const name = String(tournament?.name || "");
  const season = name.match(/\bACPL\b.*?\b(?:Season\s*)?(\d+)\b/i);
  if (season) return `ACPL-${season[1]}`;
  const fromPrefix = normalizePublicSlug(String(extras.idPrefix || "").replace(/^REG-?/i, ""));
  if (fromPrefix) return fromPrefix;
  const fromName = normalizePublicSlug(name);
  if (fromName) return fromName;
  return normalizePublicSlug(tournament?.id) || "register";
}

function field(partial) {
  return {
    id: uid(),
    enabled: true,
    required: false,
    description: "",
    placeholder: "",
    options: [],
    validation: {},
    config: {},
    predefined: true,
    ...partial
  };
}

function rule(partial) {
  return {
    id: uid(),
    group: "and",
    action: "show",
    makeRequired: false,
    ...partial
  };
}

/** Build ACPL Season 6 style registration form config for a tournament. */
export function buildAcplSeason6Form(tournament, store) {
  const categories = store.categories || [];
  const catOptions = categories.length
    ? categories.map((c) => c.name)
    : ["Men's", "Women's", "Kid's"];
  // Prefer display names with apostrophe when seeding defaults
  const displayCats =
    catOptions.length === 3
      ? catOptions.map((n) => {
          const l = String(n).toLowerCase();
          if (l === "men" || l === "men's") return "Men's";
          if (l === "women" || l === "women's") return "Women's";
          if (l === "kids" || l === "kid's" || l === "kid") return "Kid's";
          return n;
        })
      : catOptions;

  const teamIds = tournament?.teamIds || [];
  const teams = (store.teams || []).filter((t) => teamIds.includes(t.id));
  const teamOptions = teams.length
    ? teams.map((t) => t.name)
    : ["Phoenix", "Royal Challengers", "Vikings", "Royal Warriors", "Mavericks", "Strikers"];

  const sections = [
    { id: uid(), key: "player", title: "Player Information", order: 1 },
    { id: uid(), key: "jersey", title: "Jersey Information", order: 2 },
    { id: uid(), key: "cricket", title: "Cricket Information", order: 3 },
    { id: uid(), key: "auction", title: "Auction Information", order: 4 },
    { id: uid(), key: "arcus", title: "Arcus Relationship", order: 5 },
    { id: uid(), key: "payment", title: "Payment Information", order: 6 }
  ];

  const fields = [
    field({
      key: "playerName",
      sectionKey: "player",
      label: "Player Name",
      fieldType: "text",
      required: true,
      displayOrder: 10,
      placeholder: "Full name"
    }),
    field({
      key: "mobile",
      sectionKey: "player",
      label: "Mobile Number",
      fieldType: "phone",
      required: true,
      displayOrder: 20,
      placeholder: "10-digit mobile",
      validation: { pattern: "^[6-9]\\d{9}$", message: "Mobile number must be exactly 10 digits" }
    }),
    field({
      key: "email",
      sectionKey: "player",
      label: "Email ID",
      fieldType: "email",
      required: true,
      displayOrder: 25,
      placeholder: "you@example.com"
    }),
    field({
      key: "dob",
      sectionKey: "player",
      label: "Date of Birth",
      fieldType: "date",
      required: true,
      displayOrder: 30
    }),
    field({
      key: "playerPhoto",
      sectionKey: "player",
      label: "Upload player photo",
      fieldType: "image",
      required: true,
      displayOrder: 40,
      validation: { maxBytes: 5 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] }
    }),
    field({
      key: "category",
      sectionKey: "player",
      label: "Category",
      fieldType: "single",
      required: true,
      displayOrder: 50,
      options: displayCats
    }),
    field({
      key: "jerseyNameNumber",
      sectionKey: "jersey",
      label: "Name and number on Jersey",
      fieldType: "text",
      required: false,
      displayOrder: 60,
      description: "Leave blank for empty name and number.",
      placeholder: "e.g. VIRAT 18"
    }),
    field({
      key: "jerseySize",
      sectionKey: "jersey",
      label: "Size of the jersey",
      fieldType: "dropdown",
      required: true,
      displayOrder: 70,
      options: ["20", "22", "24", "26", "28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50"]
    }),
    field({
      key: "firstTimeAcpl",
      sectionKey: "cricket",
      label: "Are you playing ACPL for 1st time?",
      fieldType: "yesno",
      required: true,
      displayOrder: 80,
      options: ["Yes", "No"]
    }),
    field({
      key: "playerType",
      sectionKey: "cricket",
      label: "Player Type",
      fieldType: "single",
      required: false,
      displayOrder: 90,
      options: ["All-rounder", "Batter", "Bowler"]
    }),
    field({
      key: "battingStyle",
      sectionKey: "cricket",
      label: "Batting Style",
      fieldType: "single",
      required: false,
      displayOrder: 100,
      options: ["RHB", "LHB"]
    }),
    field({
      key: "bowlingStyle",
      sectionKey: "cricket",
      label: "Bowling Style",
      fieldType: "dropdown",
      required: false,
      displayOrder: 110,
      options: [
        "Right hand fast",
        "Right hand off spin",
        "Right hand leg spin",
        "Left hand fast",
        "Left hand off spin",
        "Left hand leg spin"
      ]
    }),
    field({
      key: "wicketkeeper",
      sectionKey: "cricket",
      label: "Wicketkeeper",
      fieldType: "yesno",
      required: false,
      displayOrder: 120,
      options: ["Yes", "No"]
    }),
    field({
      key: "cricHeroesHas",
      sectionKey: "cricket",
      label: "Do you have CricHeroes profile?",
      fieldType: "yesno",
      required: false,
      displayOrder: 130,
      options: ["No", "Yes"]
    }),
    field({
      key: "cricHeroesProfile",
      sectionKey: "cricket",
      label: "CricHeroes Profile Link or Profile Name",
      fieldType: "text",
      required: false,
      displayOrder: 140,
      placeholder: "Profile URL or name"
    }),
    field({
      key: "auctionRepresent",
      sectionKey: "auction",
      label: "Do you want to represent team in Auction",
      fieldType: "yesno",
      required: true,
      displayOrder: 150,
      description: "NA for new players",
      options: ["No", "Yes"]
    }),
    field({
      key: "auctionTeam",
      sectionKey: "auction",
      label: "Select one team",
      fieldType: "dropdown",
      required: false,
      displayOrder: 160,
      options: teamOptions,
      config: { source: "tournamentTeams" }
    }),
    field({
      key: "arcusRelation",
      sectionKey: "arcus",
      label: "Relation with Arcus",
      fieldType: "single",
      required: true,
      displayOrder: 170,
      options: ["Owner", "1st Blood Relative of Owner", "Tenant"]
    }),
    field({
      key: "flatNumber",
      sectionKey: "arcus",
      label: "Flat Number",
      fieldType: "text",
      required: false,
      displayOrder: 180,
      placeholder: "e.g. A-1204"
    }),
    field({
      key: "relationWithOwner",
      sectionKey: "arcus",
      label: "Relation With Owner",
      fieldType: "dropdown",
      required: false,
      displayOrder: 190,
      options: ["Self", "Spouse", "Mother", "Father", "Daughter", "Son"]
    }),
    field({
      key: "bloodRelativeProof",
      sectionKey: "arcus",
      label: "Upload Proof",
      fieldType: "file",
      required: false,
      displayOrder: 200,
      validation: {
        maxBytes: 5 * 1024 * 1024,
        mime: ["image/jpeg", "image/png", "application/pdf"]
      }
    }),
    field({
      key: "rentalAgreement",
      sectionKey: "arcus",
      label: "Upload Rental Agreement",
      fieldType: "file",
      required: false,
      displayOrder: 210,
      validation: {
        maxBytes: 8 * 1024 * 1024,
        mime: ["image/jpeg", "image/png", "application/pdf"]
      }
    }),
    field({
      key: "paymentPreference",
      sectionKey: "payment",
      label: "Payment Preference",
      fieldType: "single",
      required: true,
      displayOrder: 220,
      options: ["Bank Transfer", "UPI", "Other"]
    }),
    field({
      key: "bankInfo",
      sectionKey: "payment",
      label: "Bank Transfer Information",
      fieldType: "info",
      required: false,
      displayOrder: 230,
      config: { contentFrom: "payment.bank" }
    }),
    field({
      key: "bankProof",
      sectionKey: "payment",
      label: "Upload Bank Transfer Proof",
      fieldType: "file",
      required: false,
      displayOrder: 240,
      validation: {
        maxBytes: 5 * 1024 * 1024,
        mime: ["image/jpeg", "image/png", "application/pdf"]
      }
    }),
    field({
      key: "upiInfo",
      sectionKey: "payment",
      label: "UPI Information",
      fieldType: "info",
      required: false,
      displayOrder: 250,
      config: { contentFrom: "payment.upi" }
    }),
    field({
      key: "upiProof",
      sectionKey: "payment",
      label: "Upload UPI Transfer Proof",
      fieldType: "file",
      required: false,
      displayOrder: 260,
      validation: {
        maxBytes: 5 * 1024 * 1024,
        mime: ["image/jpeg", "image/png", "application/pdf"]
      }
    }),
    field({
      key: "otherPaymentMode",
      sectionKey: "payment",
      label: "Mention the mode",
      fieldType: "text",
      required: false,
      displayOrder: 270,
      placeholder: "Cash / cheque / other"
    })
  ];

  const rules = [
    rule({ sourceKey: "firstTimeAcpl", operator: "equals", value: "Yes", targetKey: "playerType", action: "show", makeRequired: true }),
    rule({ sourceKey: "firstTimeAcpl", operator: "equals", value: "Yes", targetKey: "battingStyle", action: "show", makeRequired: true }),
    // Bowling style only for Bowler / All-rounder (not Batter)
    rule({
      sourceKey: "firstTimeAcpl",
      operator: "equals",
      value: "Yes",
      targetKey: "bowlingStyle",
      action: "show",
      makeRequired: true,
      groupId: "bowling-bowler"
    }),
    rule({
      sourceKey: "playerType",
      operator: "equals",
      value: "Bowler",
      targetKey: "bowlingStyle",
      action: "show",
      makeRequired: true,
      groupId: "bowling-bowler"
    }),
    rule({
      sourceKey: "firstTimeAcpl",
      operator: "equals",
      value: "Yes",
      targetKey: "bowlingStyle",
      action: "show",
      makeRequired: true,
      groupId: "bowling-ar"
    }),
    rule({
      sourceKey: "playerType",
      operator: "equals",
      value: "All-rounder",
      targetKey: "bowlingStyle",
      action: "show",
      makeRequired: true,
      groupId: "bowling-ar"
    }),
    rule({ sourceKey: "firstTimeAcpl", operator: "equals", value: "Yes", targetKey: "wicketkeeper", action: "show", makeRequired: true }),
    rule({ sourceKey: "firstTimeAcpl", operator: "equals", value: "Yes", targetKey: "cricHeroesHas", action: "show", makeRequired: true }),
    rule({
      sourceKey: "cricHeroesHas",
      operator: "equals",
      value: "Yes",
      targetKey: "cricHeroesProfile",
      action: "show",
      makeRequired: true,
      alsoRequireSource: { key: "firstTimeAcpl", value: "Yes" }
    }),
    rule({ sourceKey: "auctionRepresent", operator: "equals", value: "Yes", targetKey: "auctionTeam", action: "show", makeRequired: true }),
    rule({ sourceKey: "arcusRelation", operator: "equals", value: "Owner", targetKey: "flatNumber", action: "show", makeRequired: true }),
    rule({ sourceKey: "arcusRelation", operator: "equals", value: "Owner", targetKey: "relationWithOwner", action: "show", makeRequired: true }),
    rule({
      sourceKey: "arcusRelation",
      operator: "equals",
      value: "1st Blood Relative of Owner",
      targetKey: "bloodRelativeProof",
      action: "show",
      makeRequired: true
    }),
    rule({ sourceKey: "arcusRelation", operator: "equals", value: "Tenant", targetKey: "rentalAgreement", action: "show", makeRequired: true }),
    rule({ sourceKey: "paymentPreference", operator: "equals", value: "Bank Transfer", targetKey: "bankInfo", action: "show" }),
    rule({ sourceKey: "paymentPreference", operator: "equals", value: "Bank Transfer", targetKey: "bankProof", action: "show", makeRequired: true }),
    rule({ sourceKey: "paymentPreference", operator: "equals", value: "UPI", targetKey: "upiInfo", action: "show" }),
    rule({ sourceKey: "paymentPreference", operator: "equals", value: "UPI", targetKey: "upiProof", action: "show", makeRequired: true }),
    rule({ sourceKey: "paymentPreference", operator: "equals", value: "Other", targetKey: "otherPaymentMode", action: "show", makeRequired: true })
  ];

  const name = tournament?.name || "Tournament";
  const idPrefix = "REG-ACPL6";
  return {
    id: uid(),
    tournamentId: tournament.id,
    title: `${name} Registration Form`,
    description: "Men's and Women's - ₹3000/-\nKids - ₹2000/-",
    logo: tournament.logo || "",
    status: "draft",
    publicToken: token(),
    publicSlug: suggestPublicSlug(tournament, { idPrefix }),
    opensAt: "",
    closesAt: "",
    capacity: 100,
    categoryCapacity: {
      "Men's": 100,
      "Women's": 50,
      "Kid's": 30
    },
    useCategoryCapacity: true,
    idPrefix,
    version: 1,
    photoPolicy: "keepExisting",
    payment: {
      fees: {
        "Men's": 3000,
        "Women's": 3000,
        "Kid's": 2000
      },
      bank: {
        accountName: "",
        accountNumber: "",
        ifsc: "",
        bankName: ""
      },
      upi: {
        upiId: "",
        mobile: "",
        qrUrl: ""
      }
    },
    ageRules: {},
    sections,
    fields,
    rules,
    fieldHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function blankRegistrationForm(tournament) {
  return {
    id: uid(),
    tournamentId: tournament.id,
    title: `${tournament.name || "Tournament"} Registration`,
    description: "",
    logo: tournament.logo || "",
    status: "draft",
    publicToken: token(),
    publicSlug: suggestPublicSlug(tournament),
    opensAt: "",
    closesAt: "",
    capacity: 100,
    categoryCapacity: {},
    useCategoryCapacity: false,
    idPrefix: "REG",
    version: 1,
    photoPolicy: "keepExisting",
    payment: {
      fees: {},
      bank: { accountName: "", accountNumber: "", ifsc: "", bankName: "" },
      upi: { upiId: "", mobile: "", qrUrl: "" }
    },
    ageRules: {},
    sections: [{ id: uid(), key: "main", title: "Details", order: 1 }],
    fields: [],
    rules: [],
    fieldHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

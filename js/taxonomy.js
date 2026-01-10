// ✅ Static taxonomy (no Firestore categories)
// primaryType + subType are OPTIONAL and should never block publishing.

export const TAXONOMY = {
  cars: {
    ar: "سيارات",
    subs: {
      sale: { ar: "بيع" },
      rent: { ar: "إيجار" },
    },
  },
  realestate: {
    ar: "عقارات",
    subs: {
      sale: { ar: "بيع" },
      rent: { ar: "إيجار" },
    },
  },
  electronics: {
    ar: "إلكترونيات",
    subs: {}, // يمكن توسيعها لاحقاً
  },
  clothing: {
    ar: "ملابس",
    subs: {
      men: { ar: "رجالي" },
      women: { ar: "نسائي" },
      kids: { ar: "ولادي" },
    },
  },
  shoes: {
    ar: "أحذية",
    subs: {
      men: { ar: "رجالي" },
      women: { ar: "نسائي" },
      kids: { ar: "ولادي" },
    },
  },
  appliances: {
    ar: "كهربائيات",
    subs: {}, // يمكن توسيعها لاحقاً
  },
  other: {
    ar: "أخرى",
    subs: {},
  },
};

export function getSubOptions(primaryType){
  const t = (primaryType || "").trim();
  const node = TAXONOMY[t];
  if (!node) return [];
  return Object.entries(node.subs || {}).map(([id, obj]) => ({ id, ar: obj.ar }));
}

export function getPrimaryAr(primaryType){
  return TAXONOMY[primaryType]?.ar || "";
}

export function getSubAr(primaryType, subType){
  return TAXONOMY[primaryType]?.subs?.[subType]?.ar || "";
}

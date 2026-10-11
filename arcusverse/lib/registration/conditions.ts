export type RegRule = {
  id?: string;
  sourceKey: string;
  operator: string;
  value?: string;
  targetKey: string;
  action?: string;
  makeRequired?: boolean;
  group?: string;
  groupId?: string;
  alsoRequireSource?: { key: string; value: string };
};

export type RegField = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  required?: boolean;
  enabled?: boolean;
  description?: string;
  placeholder?: string;
  options?: string[];
  displayOrder?: number;
  sectionKey?: string;
  validation?: { maxBytes?: number; mime?: string[]; pattern?: string; message?: string };
  config?: Record<string, any>;
  predefined?: boolean;
};

export function compareOp(operator: string, left: unknown, right: unknown) {
  const L = left == null ? "" : String(left);
  const R = right == null ? "" : String(right);
  switch (operator) {
    case "equals":
      return L === R;
    case "notEquals":
      return L !== R;
    case "contains":
      return L.toLowerCase().includes(R.toLowerCase());
    case "doesNotContain":
      return !L.toLowerCase().includes(R.toLowerCase());
    case "greaterThan":
      return Number(L) > Number(R);
    case "lessThan":
      return Number(L) < Number(R);
    case "isEmpty":
      return L.trim() === "";
    case "isNotEmpty":
      return L.trim() !== "";
    default:
      return false;
  }
}

function ruleMatches(rule: RegRule, values: Record<string, any>) {
  if (rule.alsoRequireSource) {
    if (String(values[rule.alsoRequireSource.key]) !== String(rule.alsoRequireSource.value)) return false;
  }
  return compareOp(rule.operator, values[rule.sourceKey], rule.value);
}

export function evaluateFieldState(fields: RegField[], rules: RegRule[], values: Record<string, any>) {
  const enabled = (fields || []).filter((f) => f.enabled !== false && f.fieldType !== "section");
  const list = rules || [];
  const targets = new Set(list.map((r) => r.targetKey));
  const visible: Record<string, boolean> = {};
  const required: Record<string, boolean> = {};

  for (const f of enabled) {
    visible[f.key] = targets.has(f.key) ? false : true;
    required[f.key] = !!f.required;
  }

  const byTarget = new Map<string, RegRule[]>();
  for (const r of list) {
    if (!byTarget.has(r.targetKey)) byTarget.set(r.targetKey, []);
    byTarget.get(r.targetKey)!.push(r);
  }

  for (const [targetKey, targetRules] of byTarget) {
    const groups = new Map<string, RegRule[]>();
    for (const r of targetRules) {
      const g = r.groupId || r.group || "default";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(r);
    }
    let show = false;
    let makeReq = false;
    for (const [, groupRules] of groups) {
      if (groupRules.every((r) => ruleMatches(r, values))) {
        show = true;
        if (groupRules.some((r) => r.makeRequired || r.action === "require")) makeReq = true;
      }
    }
    visible[targetKey] = show;
    required[targetKey] = show && (makeReq || !!enabled.find((f) => f.key === targetKey)?.required);
    if (!show) required[targetKey] = false;
  }

  return { visible, required };
}

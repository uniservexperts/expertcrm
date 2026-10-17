// One shared way to read the activity log, so every report agrees.
//
// Updates made with the combined "Save update" button are stored as a single
// "Lead updated" entry whose detail looks like:
//   "Note: ... · Status: A → B · Follow-up: Call on 07 Sep 2026"
// Older entries use separate types ("Note added", "Status changed", ...).
export type ActivityFlags = {
  created: boolean;
  note: boolean;
  status: boolean;
  followupSet: boolean;
  followupDone: boolean;
};

export function classifyActivity(type: string, detail: string | null): ActivityFlags {
  const f: ActivityFlags = { created: false, note: false, status: false, followupSet: false, followupDone: false };
  switch (type) {
    case "Lead created": f.created = true; break;
    case "Note added": f.note = true; break;
    case "Status changed": f.status = true; break;
    case "Follow-up scheduled": f.followupSet = true; break;
    case "Follow-up completed": f.followupDone = true; break;
    case "Lead updated":
      for (const part of (detail || "").split(" · ")) {
        if (part.startsWith("Note: ")) f.note = true;
        else if (part.startsWith("Status: ")) f.status = true;
        else if (part.startsWith("Follow-up: ")) f.followupSet = true;
      }
      break;
  }
  return f;
}

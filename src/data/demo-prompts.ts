export type PromptKind = "build" | "edit" | "clarify";

export interface DemoPrompt {
  text: string;
  caption: string;
  kind: PromptKind;
  targetTitle?: string; // For edit kind
}

export interface IndustryCategory {
  id: string;
  label: string;
  prompts: DemoPrompt[];
}

export const DEMO_INDUSTRIES: IndustryCategory[] = [
  {
    id: "fnb",
    label: "Retail & F&B",
    prompts: [
      {
        text: "Track daily sales for Karthik, Priya, Arun against ₹50k targets",
        caption: "A grid with staff targets. Matches your dashboard data.",
        kind: "build"
      },
      {
        text: "Evening closing checklist — registers reconciled, doors locked, AC off",
        caption: "A daily compliance list. Captures the 'AC left on' incident.",
        kind: "build"
      },
      {
        text: "Close the drawer: cash + UPI − returns, flag if it doesn't match",
        caption: "Engine-exact math write-guard preventing bad entries.",
        kind: "build"
      },
      {
        text: "Add a Zomato column to my Daily Sales Tracker",
        caption: "Edits your live tracker. Old QR codes still work.",
        kind: "edit",
        targetTitle: "Daily Sales Tracker"
      },
      {
        text: "Build a target tracker",
        caption: "Watch the AI ask for missing details instead of guessing.",
        kind: "clarify"
      }
    ]
  },
  {
    id: "fitness",
    label: "Fitness/Gym",
    prompts: [
      {
        text: "Daily trainer target tracker — 4 trainers hitting 30 sessions/day",
        caption: "Staff grids for services, tracking % completion.",
        kind: "build"
      },
      {
        text: "New-member onboarding checklist with photo of ID card",
        caption: "Requires a photo upload from the camera.",
        kind: "build"
      },
      {
        text: "Member check-in sheet for 4 trainers",
        caption: "Simple roster logging.",
        kind: "build"
      }
    ]
  },
  {
    id: "salon",
    label: "Salon & Wellness",
    prompts: [
      {
        text: "Daily client appointments for 3 stylists with service and billed amount",
        caption: "Grid format customized to specific staff and revenue primitives.",
        kind: "build"
      },
      {
        text: "Evening closing — tools sanitized, cash drawer reconciled, zero unpaid tabs",
        caption: "Compliance combined with a math invariant (unpaid tabs = 0).",
        kind: "build"
      },
      {
        text: "Walk-in photo capture for new clients",
        caption: "Visual proof attached to the ledger.",
        kind: "build"
      }
    ]
  },
  {
    id: "pharmacy",
    label: "Pharmacy",
    prompts: [
      {
        text: "Daily stock count for top 20 fast-moving medicines",
        caption: "Long-form inventory sheet.",
        kind: "build"
      },
      {
        text: "End-of-day sales + schedule against GST totals",
        caption: "Math guard for financial reconciliations.",
        kind: "build"
      },
      {
        text: "Flag any stock below reorder point",
        caption: "Threshold alarms computed at submission.",
        kind: "build"
      }
    ]
  }
];

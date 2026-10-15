import { redirect } from "next/navigation";

// The base /submit route was a leftover universal-extraction playground.
// Every real app lives at /submit/[id]; send stray visitors home.
export default function SubmitIndexPage() {
  redirect("/");
}
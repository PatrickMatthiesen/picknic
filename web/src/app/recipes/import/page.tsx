import { redirect } from "next/navigation";

export default function ImportRecipePage() {
  redirect("/recipes/new?method=copy-paste");
}

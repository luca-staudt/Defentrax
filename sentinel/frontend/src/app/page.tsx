import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api/server";
import { firstAllowedHref } from "@/lib/pages";
import type { User } from "@/lib/types";

export default async function Home() {
  const { data, status } = await serverApiFetch<User>("/auth/me");
  if (status !== 200 || !data) {
    redirect("/login");
  }
  redirect(firstAllowedHref(data) ?? "/dashboard");
}

import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api/server";
import type { User } from "@/lib/types";

export default async function Home() {
  const { status } = await serverApiFetch<User>("/auth/me");
  redirect(status === 200 ? "/dashboard" : "/login");
}

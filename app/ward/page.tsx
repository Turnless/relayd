import type { Metadata } from "next";
import WardApp from "@/components/ward/WardApp";

export const metadata: Metadata = { title: "Relayd · Morning handover" };

export default function WardPage() {
  return <WardApp />;
}

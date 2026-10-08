import { ComingSoon, comingSoonMetadata } from "@/components/coming-soon";

export const dynamic = "force-dynamic";
export const metadata = comingSoonMetadata;

export default function ComingSoonRoute() {
  return <ComingSoon />;
}

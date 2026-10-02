import { AssistantHint, BannerEditor } from "@/components/banner-editor";
import { assertPagePermission } from "@/server/guard";

export const metadata = { title: "New banner" };

export default async function NewBannerPage() {
  await assertPagePermission("banner.create");
  return (
    <main>
      <h2 className="text-2xl font-bold">New banner</h2>
      <AssistantHint />
      <div className="mt-4">
        <BannerEditor
          initial={{
            id: null,
            name: "",
            placement: "HOME_MAIN",
            headline: "",
            subtitle: "",
            imageId: null,
            mobileImageId: null,
            ctaLabel: "",
            ctaDestination: "",
            altText: "",
            startAt: "",
            endAt: "",
            sortOrder: 0,
            status: "DRAFT",
            publishedAt: null,
          }}
        />
      </div>
    </main>
  );
}

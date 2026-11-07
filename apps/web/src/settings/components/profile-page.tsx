import { DeleteAccountSection, ProfileSection } from "@/account";

export function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <ProfileSection />
      <DeleteAccountSection />
    </div>
  );
}

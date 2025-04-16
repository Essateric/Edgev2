import ClientHistoryWidget from "../components/ClientHistoryWidget";

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      {/* Other widgets... */}
      <ClientHistoryWidget />
    </div>
  );
}

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bot, LayoutDashboard, LogIn, MoonStar } from "lucide-react";
import { getSessionTenantId } from "@/lib/infra/auth";

export default async function HomePage() {
  const tenantId = await getSessionTenantId();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Autonomous Operations Desk</h1>
          <p className="text-lg text-muted-foreground mt-2">The zero-friction scaling engine for your physical business.</p>
        </div>

        {tenantId ? (
          <div className="grid md:grid-cols-3 gap-4 text-left">
            <Link href="/builder" className="group">
              <Card className="h-full hover:border-primary hover:shadow-md transition-all">
                <CardHeader>
                  <Bot className="w-8 h-8 text-primary mb-2 group-hover:scale-110 transition-transform" />
                  <CardTitle>1. App Builder (Owner)</CardTitle>
                  <CardDescription>Chat with the AI Architect to generate custom data-entry forms for your staff instantly.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/dashboard" className="group">
              <Card className="h-full hover:border-green-500 hover:shadow-md transition-all">
                <CardHeader>
                  <LayoutDashboard className="w-8 h-8 text-green-600 mb-2 group-hover:scale-110 transition-transform" />
                  <CardTitle>2. Executive Dashboard</CardTitle>
                  <CardDescription>View real-time, mathematically verified submissions and target percentages from your branches.</CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/verdict" className="group">
              <Card className="h-full hover:border-indigo-500 hover:shadow-md transition-all">
                <CardHeader>
                  <MoonStar className="w-8 h-8 text-indigo-600 mb-2 group-hover:scale-110 transition-transform" />
                  <CardTitle>3. Tonight&apos;s Verdict</CardTitle>
                  <CardDescription>The nightly ops scorecard — what happened today, what needs your eyes before you sleep.</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        ) : (
          <div className="flex justify-center mt-8">
            <Link href="/login">
              <Card className="hover:border-primary hover:shadow-md transition-all px-8 py-4 bg-white cursor-pointer inline-flex items-center space-x-4">
                <LogIn className="w-6 h-6 text-primary" />
                <div className="text-left">
                  <h3 className="font-semibold text-gray-900">Owner Login</h3>
                  <p className="text-sm text-gray-500">Sign in to view your desk</p>
                </div>
              </Card>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

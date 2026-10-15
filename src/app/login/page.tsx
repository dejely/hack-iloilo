import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="rounded-md">
        <Wordmark className="h-10 w-auto text-primary" />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Staff sign in</CardTitle>
          <CardDescription>Sign in with your staff account.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Booking, selling palay or checking a booking?{" "}
        <Link
          href="/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to the home page
        </Link>
      </p>
    </main>
  );
}

import { supabase } from './supabase.js';

async function mostraLinkAdminRoseSeAdmin() {
  const adminRoseLink = document.getElementById("nav-admin-rose");
  if (!adminRoseLink) return;

  adminRoseLink.style.display = "none";

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) return;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !profile) return;

  if (profile.role === "admin") {
    adminRoseLink.style.display = "";
  }
}

document.addEventListener("DOMContentLoaded", mostraLinkAdminRoseSeAdmin);

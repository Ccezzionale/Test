import { supabase } from './supabase.js';

async function mostraMenuRoseCorretto() {
  const roseNormal = document.getElementById("nav-rose-normal");
  const roseAdmin = document.getElementById("nav-rose-admin");

  if (!roseNormal || !roseAdmin) return;

  // Stato base: utente normale
  roseNormal.style.display = "";
  roseAdmin.style.display = "none";

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
    roseNormal.style.display = "none";
    roseAdmin.style.display = "";
  }
}

document.addEventListener("DOMContentLoaded", mostraMenuRoseCorretto);

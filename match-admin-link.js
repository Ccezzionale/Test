// Link admin visibile soltanto agli utenti abilitati (il vero controllo è nelle policy SQL).
import {supabase} from "./supabase.js";
(async()=>{
  const host=document.getElementById("mc-admin-panel-link");
  if(!host) return;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return;
    const {data,error}=await supabase.from("mc_admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if(!error&&data) host.hidden=false;
  }catch(error){console.warn("Link Admin Match Center non disponibile:",error);}
})();

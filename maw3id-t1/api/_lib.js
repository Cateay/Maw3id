const {createClient}=require('@supabase/supabase-js');const {Resend}=require('resend');
const supabase=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const resend=()=>process.env.RESEND_API_KEY?new Resend(process.env.RESEND_API_KEY):null;
function cors(res){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS')}
function dateLabel(s){return new Date(s+'T12:00:00').toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}function timeLabel(t){let [h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'ص':'م'}`}
function meetingUrl(code){return `https://meet.jit.si/Maw3id-${code}`}
function code(){return 'MW-'+Math.random().toString(36).slice(2,8).toUpperCase()}
module.exports={supabase,resend,cors,dateLabel,timeLabel,meetingUrl,code};

// `agent-videostudio doctor [--json]` — print the machine checks and exit (1 if something required is missing)
import { runDoctor, formatDoctor } from './doctor.ts';

const checks = await runDoctor();
if (process.argv.includes('--json')) console.log(JSON.stringify(checks, null, 2));
else console.log('\n' + formatDoctor(checks) + '\n');
process.exit(checks.some((c) => c.status === 'missing') ? 1 : 0);

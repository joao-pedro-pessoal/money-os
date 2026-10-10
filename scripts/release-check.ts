import { config } from "dotenv";
import { closedTestPreflight } from "../src/lib/release/preflight";

// Existing process variables win. Only this explicit command loads .env.
config({ quiet: true });
const problems = closedTestPreflight(process.env);
console.log("Configuração para teste fechado por convites (sem ligar à base de dados):");
for (const problem of problems) console.log(`- ${problem}`);
if (!problems.length) console.log("Configuração verificada. Isto não é aprovação para publicação.");
console.log("Ainda é preciso comprovar: restauro de backup, isolamento entre contas, teste em telemóveis, capacidade e configuração da Play Console.");
console.log("Este comando não verifica nem altera a configuração da Vercel.");
process.exitCode = problems.length ? 1 : 0;

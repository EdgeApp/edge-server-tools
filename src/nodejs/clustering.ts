import cluster from 'cluster'
import { cpus } from 'os'

export function forkChildren(customNumCpus?: number): void {
  const numCPUs = cpus().length
  const instanceCount = customNumCpus ?? numCPUs

  // Fork workers.
  for (let i = 0; i < instanceCount; i++) {
    cluster.fork()
  }
  // Restart workers when they exit
  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
    )
    console.log(`Forking new worker process...`)
    cluster.fork()
  })
}

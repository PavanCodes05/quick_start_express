import { confirm, select } from "@inquirer/prompts";
import { templates } from "../bin/configs.js";

async function promptCacheService(packageName) {
  // Predefined list of cache images
  const cacheImages = [
    "redis:latest",          // Latest Redis
    "redis:6.2",             // Specific Redis version
    "redis:7.0",             // Another Redis version
    "memcached:latest",      // Memcached
    "amazon/aws-elasticache:redis" // AWS ElastiCache Redis-compatible image
  ];
  
  const image = await select({
    message: "Select the Docker image for the cache service:",
    choices: cacheImages.map((img) => ({ name: img, value: img })),
  });
  
  let ports;
  switch (image) {
    case "redis:latest":
    case "redis:6.2":
    case "redis:7.0":
      ports = ["6379:6379"]; // Redis uses the same standard port across versions
      break;
    case "memcached:latest":
      ports = ["11211:11211"];
      break;
    case "amazon/aws-elasticache:redis":
      ports = ["6379:6379"]; // AWS Redis uses the same standard Redis port
      break;
    default:
      throw new Error("Cache Image not Found!");
  }  

  return {
    name: `${packageName}_cache`,
    image: image,
    containerName: `${packageName}_cache_container`,
    ports: ports
  };
}

export async function getServicesData(packageName, selectedTemplate) {
  const templateData = templates[selectedTemplate];
  const services = [];

  console.log("\n");

  // App service configuration
  const appService = {
    name: packageName,
    containerName: `${packageName}_container`,
    build: true,
    ports: [templateData.serverPort]
  };

  services.push(appService);

  // Database service configuration
  if (isDBRequired(selectedTemplate)) {
    const dbService = {
      name: `${packageName}_db`,
      image: templateData.dbDockerImage,
      containerName: `${packageName}_db_container`,
      ports: [templateData.dbPort]
    };
    services.push(dbService);
  }

  // Cache service configuration
  const addCacheService = await confirm({
    message: "Do you want to add a cache service?",
    default: false,
  });

  if (addCacheService) {
    services.push(await promptCacheService(packageName));
  }

  console.log("\n");
  return services;
}

// Generates the File content for docker-compose.yml using the services data
export function generateDockerComposeFile(services) {
  const compose = {
    version: "3.8",
    services: {},
  };

  services.forEach((service) => {
    const serviceConfig = {
      container_name: service.containerName,
      ports: service.ports?.length > 0 ? service.ports : undefined,
      restart: "on-failure",
    };

    if (service.build) {
      serviceConfig.build = { context: "." }; // Use Dockerfile for building the image
    } else {
      serviceConfig.image = service.image;
    }

    serviceConfig.env_file = [".env"];
    compose.services[service.name] = serviceConfig;
  });

  const yaml = `
version: '${compose.version}'
services:
${Object.entries(compose.services)
  .map(([name, config]) => {
    const build = config.build ? `      build:\n        context: ${config.build.context}` : `      image: ${config.image}`;
    const ports = config.ports ? `      ports:\n${config.ports.map((port) => `        - "${port}"`).join("\n")}` : "";
    const envFile = config.env_file ? `      env_file:\n${config.env_file.map((file) => `        - ${file}`).join("\n")}` : "";
    return `  ${name}:
${build}
      container_name: ${config.container_name}
${ports}
${envFile}
      restart: ${config.restart}`;
  })
  .join("\n\n")}`;

  return yaml.trim();
}

// Helper function to check if DB is required by checking the template name.
function isDBRequired(selectedTemplate) {
    const parts = selectedTemplate.split("_");
    for (let part of parts) {
        if (part.toLowerCase() === "pg" || part.toLowerCase() === "mysql") {
            return true;
        }
    }
    return false;
}
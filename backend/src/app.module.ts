import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { DepartmentsModule } from "./departments/departments.module";
import { DocumentsModule } from "./documents/documents.module";
import { FinancePackagesModule } from "./finance-packages/finance-packages.module";
import { PartnersModule } from "./partners/partners.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TagsModule } from "./tags/tags.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.local"],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    CategoriesModule,
    TagsModule,
    PartnersModule,
    DocumentsModule,
    FinancePackagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

# Riscoss Platform Easy-Build

This is the easiest way to get a finished development build of the RISCOSS platform on Unix.

    git clone https://github.com/cjdelisle/riscoss-platform-build.git
    cd riscoss-platform-build
    ./update
    ./do

In 10 minutes or so, this will build a complete RISCOSS instance with tomcat and HSQLDB,
then it will start tomcat on port 8080 (make sure nothing else is using this port) and
install the default pages which comprise the RISCOSS Platform data. When it completes
you should be able to go to `http://localhost:8080/riscoss/wikis/wiki1/` for a bare-bones
RISCOSS Platform instance.
